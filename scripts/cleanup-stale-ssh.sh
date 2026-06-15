#!/usr/bin/env bash
# Reclaim memory from stale SSH/Cursor remote sessions and orphaned ssh-agent processes.
#
# Targets:
#   1. ssh-agent processes older than 48 hours (default)
#   2. ssh-agent emergency prune when count reaches 3500 (kills oldest first, any age)
#   3. ssh-agent emergency prune when total RSS reaches 15 GB (kills oldest first, any age)
#   4. Remote logind sessions (SSH/Cursor) older than 48h with no Echo/Docker/production processes
#
# Protected: PM2, Echo app processes, Docker stack, Caddy, Postgres, LiveKit, NATS, Redis.
#
# Usage:
#   bash scripts/cleanup-stale-ssh.sh              # apply
#   ECHO_SSH_CLEANUP_DRY_RUN=1 bash scripts/cleanup-stale-ssh.sh
#
# Env:
#   ECHO_SSH_CLEANUP_MAX_AGE_HOURS (48)
#   ECHO_SSH_AGENT_MAX_COUNT (3500) — hard cap; emergency prune below 90% of this
#   ECHO_SSH_AGENT_MAX_RSS_GB (15) — hard cap; emergency prune below 90% of this
#   ECHO_SSH_CLEANUP_DRY_RUN (1 = log only)
#   ECHO_SSH_CLEANUP_LOG (default: ~/.local/state/echo-ssh-cleanup.log)
set -euo pipefail

MAX_AGE_HOURS="${ECHO_SSH_CLEANUP_MAX_AGE_HOURS:-48}"
MAX_AGE_SEC=$((MAX_AGE_HOURS * 3600))
SSH_AGENT_MAX_COUNT="${ECHO_SSH_AGENT_MAX_COUNT:-3500}"
SSH_AGENT_TARGET_COUNT=$((SSH_AGENT_MAX_COUNT * 90 / 100))
SSH_AGENT_MAX_RSS_GB="${ECHO_SSH_AGENT_MAX_RSS_GB:-15}"
SSH_AGENT_MAX_RSS_KB=$((SSH_AGENT_MAX_RSS_GB * 1024 * 1024))
SSH_AGENT_TARGET_RSS_KB=$((SSH_AGENT_MAX_RSS_KB * 90 / 100))
DRY_RUN="${ECHO_SSH_CLEANUP_DRY_RUN:-0}"
LOG="${ECHO_SSH_CLEANUP_LOG:-$HOME/.local/state/echo-ssh-cleanup.log}"
NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$(dirname "$LOG")"

log() {
  local line="[$NOW_ISO] $*"
  echo "$line"
  echo "$line" >>"$LOG"
}

is_protected_cmd() {
  local cmd="$1"
  [[ -z "$cmd" ]] && return 1
  grep -qiE \
    'dockerd|docker-proxy|containerd|caddy|(^|/)PM2|pm2 God|postgres:|postgres |livekit|livekit-server|coturn|turnserver|nats-server|redis-server|/prod/echo/|watchdog\.mjs|echo-backend|echo-frontend|echo-marketing|echo-video|vite preview|astro preview|npm start|npm run worker|npm run preview|concurrently' \
    <<<"$cmd"
}

session_has_protected_process() {
  local sid="$1"
  local pid cmd
  while read -r pid cmd; do
    [[ -z "${pid:-}" ]] && continue
    if is_protected_cmd "$cmd"; then
      log "skip session $sid: protected pid=$pid cmd=${cmd:0:120}"
      return 0
    fi
  done < <(ps -s "$sid" -o pid=,cmd= 2>/dev/null || true)
  return 1
}

session_age_sec() {
  local sid="$1"
  local ts epoch
  ts="$(loginctl show-session "$sid" -p Timestamp --value 2>/dev/null || true)"
  [[ -z "$ts" ]] && echo 0 && return
  epoch="$(date -d "$ts" +%s 2>/dev/null || echo 0)"
  [[ "$epoch" -eq 0 ]] && echo 0 && return
  echo $(($(date +%s) - epoch))
}

ssh_agent_total_rss_kb() {
  ps -C ssh-agent -o rss= 2>/dev/null | awk '{s+=$1} END {print s+0}'
}

ssh_agent_count() {
  ps -C ssh-agent -o pid= 2>/dev/null | awk 'NF {n++} END {print n+0}'
}

kill_ssh_agent() {
  local pid="$1"
  local reason="$2"
  local etimes="${3:-?}"
  local rss_kb="${4:-?}"

  if [[ "$DRY_RUN" == "1" ]]; then
    log "dry-run: would kill ssh-agent pid=$pid reason=$reason age_sec=$etimes rss_kb=$rss_kb"
    return 0
  fi
  if kill "$pid" 2>/dev/null; then
    log "killed ssh-agent pid=$pid reason=$reason age_sec=$etimes rss_kb=$rss_kb"
    return 0
  fi
  log "failed to kill ssh-agent pid=$pid (already gone?)"
  return 1
}

cleanup_ssh_agents() {
  local pid etimes rss cmd
  local killed_age=0 skipped_young=0 killed_count=0 killed_cap=0
  local total_kb count

  total_kb="$(ssh_agent_total_rss_kb)"
  count="$(ssh_agent_count)"
  log "ssh-agent baseline: count=$count total_rss_mb=$((total_kb / 1024)) cap_count=$SSH_AGENT_MAX_COUNT cap_gb=$SSH_AGENT_MAX_RSS_GB"

  while read -r pid etimes cmd; do
    [[ -z "${pid:-}" ]] && continue
    if [[ "$etimes" -lt "$MAX_AGE_SEC" ]]; then
      skipped_young=$((skipped_young + 1))
      continue
    fi
    rss="$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ' || echo 0)"
    kill_ssh_agent "$pid" "max_age" "$etimes" "$rss" && killed_age=$((killed_age + 1))
  done < <(ps -C ssh-agent -o pid=,etimes=,cmd= 2>/dev/null || true)

  count="$(ssh_agent_count)"
  if [[ "$count" -ge "$SSH_AGENT_MAX_COUNT" ]]; then
    log "ssh-agent count exceeded: count=$count >= cap_count=$SSH_AGENT_MAX_COUNT; emergency prune to ~$SSH_AGENT_TARGET_COUNT"
    while read -r pid etimes rss cmd; do
      [[ -z "${pid:-}" ]] && continue
      count="$(ssh_agent_count)"
      [[ "$count" -lt "$SSH_AGENT_TARGET_COUNT" ]] && break
      kill_ssh_agent "$pid" "count" "$etimes" "$rss" && killed_count=$((killed_count + 1))
    done < <(ps -C ssh-agent -o pid=,etimes=,rss=,cmd= 2>/dev/null | sort -k2 -nr || true)
  fi

  total_kb="$(ssh_agent_total_rss_kb)"
  if [[ "$total_kb" -ge "$SSH_AGENT_MAX_RSS_KB" ]]; then
    log "ssh-agent cap exceeded: total_rss_mb=$((total_kb / 1024)) >= cap_mb=$((SSH_AGENT_MAX_RSS_KB / 1024)); emergency prune to ~$((SSH_AGENT_TARGET_RSS_KB / 1024))MB"
    while read -r pid etimes rss cmd; do
      [[ -z "${pid:-}" ]] && continue
      total_kb="$(ssh_agent_total_rss_kb)"
      [[ "$total_kb" -lt "$SSH_AGENT_TARGET_RSS_KB" ]] && break
      kill_ssh_agent "$pid" "cap" "$etimes" "$rss" && killed_cap=$((killed_cap + 1))
    done < <(ps -C ssh-agent -o pid=,etimes=,rss=,cmd= 2>/dev/null | sort -k2 -nr || true)
  fi

  total_kb="$(ssh_agent_total_rss_kb)"
  count="$(ssh_agent_count)"
  log "ssh-agent summary: killed_age=$killed_age killed_count=$killed_count killed_cap=$killed_cap skipped_young=$skipped_young remaining=$count total_rss_mb=$((total_kb / 1024))"
}

cleanup_remote_sessions() {
  local line sid remote class age terminated=0 skipped=0
  if ! command -v loginctl >/dev/null 2>&1; then
    log "loginctl not available; skipping session cleanup"
    return
  fi

  while read -r line; do
    [[ -z "$line" ]] && continue
    sid="$(awk '{print $1}' <<<"$line")"
    [[ -z "$sid" || "$sid" == "SESSION" ]] && continue

    remote="$(loginctl show-session "$sid" -p Remote --value 2>/dev/null || true)"
    class="$(loginctl show-session "$sid" -p Class --value 2>/dev/null || true)"
    if [[ "$remote" != "yes" ]]; then
      skipped=$((skipped + 1))
      continue
    fi
    if [[ "$class" != "user" ]]; then
      skipped=$((skipped + 1))
      continue
    fi

    age="$(session_age_sec "$sid")"
    if [[ "$age" -lt "$MAX_AGE_SEC" ]]; then
      skipped=$((skipped + 1))
      continue
    fi

    if session_has_protected_process "$sid"; then
      skipped=$((skipped + 1))
      continue
    fi

    if [[ "$DRY_RUN" == "1" ]]; then
      log "dry-run: would terminate remote session $sid age_sec=$age class=$class"
      terminated=$((terminated + 1))
      continue
    fi

    if loginctl terminate-session "$sid" 2>/dev/null; then
      log "terminated remote session $sid age_sec=$age class=$class"
      terminated=$((terminated + 1))
    else
      log "failed to terminate session $sid"
    fi
  done < <(loginctl list-sessions --no-legend 2>/dev/null || true)

  log "session summary: terminated=$terminated skipped=$skipped"
}

verify_production_running() {
  local ok=1
  if command -v pm2 >/dev/null 2>&1; then
    if ! pm2 pid echo-backend >/dev/null 2>&1; then
      log "WARN: echo-backend not in PM2 after cleanup"
      ok=0
    fi
  fi
  if command -v docker >/dev/null 2>&1; then
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^echo-postgres$'; then
      log "WARN: echo-postgres container not running after cleanup"
      ok=0
    fi
  fi
  if [[ "$ok" -eq 1 ]]; then
    log "post-check: echo-backend PM2 + echo-postgres docker OK"
  fi
}

log "cleanup-stale-ssh start max_age_hours=$MAX_AGE_HOURS ssh_agent_cap_count=$SSH_AGENT_MAX_COUNT ssh_agent_cap_gb=$SSH_AGENT_MAX_RSS_GB dry_run=$DRY_RUN"
cleanup_ssh_agents
cleanup_remote_sessions
verify_production_running
log "cleanup-stale-ssh done"
