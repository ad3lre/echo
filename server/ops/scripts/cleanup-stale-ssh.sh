#!/usr/bin/env bash
# Reclaim memory from stale SSH/Cursor remote sessions, orphaned ssh-agent processes,
# and stuck `pm2 update` zombie piles.
#
# Targets:
#   1. Inventory snapshot (load/mem/swap + Cursor/SSH/pm2-update zombie counts) every run
#   2. ssh-agent processes older than MAX_AGE (default 24h)
#   3. ssh-agent emergency prune when count/RSS caps hit
#   4. Duplicate cursor-agent workers (same workspace_key → keep newest)
#   5. Orphan login shells (`bash -l`) older than MAX_AGE outside protected sessions
#   6. Remote logind sessions older than MAX_AGE with no protected processes
#   7. Abandoned (State=closing) remote sessions older than ABANDONED_MAX_AGE (default 6h)
#   8. Stuck `pm2 update` processes (age + count caps — these once ate ~12GB as 810 zombies)
#
# Protected: PM2 God daemon + managed apps, Echo app processes, Docker stack, Caddy,
#            Postgres, LiveKit, NATS, Redis, exyno-computer Chrome.
#            Does NOT protect `pm2 update` CLI zombies.
#
# Usage:
#   bash server/ops/scripts/cleanup-stale-ssh.sh
#   ECHO_SSH_CLEANUP_DRY_RUN=1 bash server/ops/scripts/cleanup-stale-ssh.sh
#
# Env:
#   ECHO_SSH_CLEANUP_MAX_AGE_HOURS (24)
#   ECHO_SSH_ABANDONED_MAX_AGE_HOURS (6)
#   ECHO_SSH_AGENT_MAX_COUNT (400)
#   ECHO_SSH_AGENT_MAX_RSS_GB (4)
#   ECHO_CURSOR_AGENT_MAX_COUNT (12) — hard cap across all cursor-agent workers
#   ECHO_PM2_UPDATE_MAX_AGE_SEC (300) — kill `pm2 update` older than this
#   ECHO_PM2_UPDATE_COUNT_CAP (5) — if this many exist, kill all regardless of age
#   ECHO_SSH_CLEANUP_DRY_RUN (1 = log only)
#   ECHO_SSH_CLEANUP_LOG (default: ~/.local/state/echo-ssh-cleanup.log)
set -euo pipefail

MAX_AGE_HOURS="${ECHO_SSH_CLEANUP_MAX_AGE_HOURS:-24}"
MAX_AGE_SEC=$((MAX_AGE_HOURS * 3600))
ABANDONED_MAX_AGE_HOURS="${ECHO_SSH_ABANDONED_MAX_AGE_HOURS:-6}"
ABANDONED_MAX_AGE_SEC=$((ABANDONED_MAX_AGE_HOURS * 3600))
SSH_AGENT_MAX_COUNT="${ECHO_SSH_AGENT_MAX_COUNT:-400}"
SSH_AGENT_TARGET_COUNT=$((SSH_AGENT_MAX_COUNT * 90 / 100))
SSH_AGENT_MAX_RSS_GB="${ECHO_SSH_AGENT_MAX_RSS_GB:-4}"
SSH_AGENT_MAX_RSS_KB=$((SSH_AGENT_MAX_RSS_GB * 1024 * 1024))
SSH_AGENT_TARGET_RSS_KB=$((SSH_AGENT_MAX_RSS_KB * 90 / 100))
CURSOR_AGENT_MAX_COUNT="${ECHO_CURSOR_AGENT_MAX_COUNT:-12}"
CURSOR_AGENT_TARGET_COUNT=$((CURSOR_AGENT_MAX_COUNT * 90 / 100))
PM2_UPDATE_MAX_AGE_SEC="${ECHO_PM2_UPDATE_MAX_AGE_SEC:-300}"
PM2_UPDATE_COUNT_CAP="${ECHO_PM2_UPDATE_COUNT_CAP:-5}"
DRY_RUN="${ECHO_SSH_CLEANUP_DRY_RUN:-0}"
LOG="${ECHO_SSH_CLEANUP_LOG:-$HOME/.local/state/echo-ssh-cleanup.log}"
NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$(dirname "$LOG")"

log() {
  local line="[$NOW_ISO] $*"
  echo "$line"
  echo "$line" >>"$LOG"
}

count_cmd() {
  # $1 = regex matched against full cmdline (ps -eo cmd=)
  # Always emit a number; grep exit 1 on zero matches must not trip pipefail.
  local n
  n="$(ps -eo cmd= 2>/dev/null | grep -E "$1" | grep -v grep | wc -l | tr -d " " || true)"
  echo "${n:-0}"
}

is_protected_cmd() {
  local cmd="$1"
  [[ -z "$cmd" ]] && return 1
  grep -qiE \
    "dockerd|docker-proxy|containerd|caddy|(^|/)PM2|pm2 God|postgres:|postgres |livekit|livekit-server|coturn|turnserver|nats-server|redis-server|/prod/echo/|watchdog\.mjs|echo-backend|echo-web|echo-marketing|echo-video|vite preview|astro preview|bun run start|bun run worker|bun run preview|concurrently|exyno-computer-chrome|/opt/google/chrome/chrome" \
    <<<"$cmd"
}

session_has_protected_process() {
  local sid="$1"
  local pid cmd
  while read -r pid cmd; do
    [[ -z "${pid:-}" ]] && continue
    if is_protected_cmd "$cmd"; then
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
  ps -C ssh-agent -o rss= 2>/dev/null | awk "{s+=\$1} END {print s+0}"
}

ssh_agent_count() {
  ps -C ssh-agent -o pid= 2>/dev/null | awk "NF {n++} END {print n+0}"
}

pm2_update_count() {
  count_cmd "[/]pm2 update|(^| )pm2 update"
}

log_inventory() {
  local label="$1"
  local load swap_used swap_total mem_avail agents bash_l abandoned ext_hosts cursor_agents chrome_n pm2_upd
  load="$(cut -d" " -f1-3 /proc/loadavg 2>/dev/null || echo "?")"
  read -r swap_total swap_used _ < <(free -k 2>/dev/null | awk "/^Swap:/ {print \$2, \$3, \$4}" || echo "0 0 0")
  mem_avail="$(free -m 2>/dev/null | awk "/^Mem:/ {print \$7}" || echo "?")"
  agents="$(ssh_agent_count)"
  bash_l="$(ps -eo args= 2>/dev/null | grep -cE "^(/bin/bash|/usr/bin/bash) -l$" || true)"
  abandoned="$(systemctl list-units --type=scope --all --no-pager 2>/dev/null | grep -c "abandoned Session" || true)"
  ext_hosts="$(count_cmd "bootstrap-fork --type=extensionHost")"
  cursor_agents="$(count_cmd "cursor-agent .* worker start")"
  chrome_n="$(count_cmd "/opt/google/chrome/chrome ")"
  pm2_upd="$(pm2_update_count)"
  log "inventory[$label]: load=$load mem_avail_mb=$mem_avail swap_used_mb=$((swap_used/1024))/${swap_total:-0} ssh_agents=$agents bash_l=$bash_l abandoned_sessions=$abandoned extensionHosts=$ext_hosts cursor_agents=$cursor_agents chrome=$chrome_n pm2_update=$pm2_upd"
}

declare -A _KILL_LOG_COUNT=()
kill_pid() {
  local pid="$1"
  local reason="$2"
  local detail="${3:-}"
  local n
  n="${_KILL_LOG_COUNT[$reason]:-0}"
  n=$((n + 1))
  _KILL_LOG_COUNT[$reason]="$n"
  local should_log=0
  if [[ "$n" -le 5 || $((n % 100)) -eq 0 ]]; then
    should_log=1
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    [[ "$should_log" -eq 1 ]] && log "dry-run: would kill pid=$pid reason=$reason $detail (n=$n)"
    return 0
  fi
  if kill "$pid" 2>/dev/null; then
    [[ "$should_log" -eq 1 ]] && log "killed pid=$pid reason=$reason $detail (n=$n)"
    return 0
  fi
  log "failed to kill pid=$pid reason=$reason (already gone?)"
  return 1
}

kill_ssh_agent() {
  local pid="$1"
  local reason="$2"
  local etimes="${3:-?}"
  local rss_kb="${4:-?}"
  kill_pid "$pid" "ssh-agent:$reason" "age_sec=$etimes rss_kb=$rss_kb"
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
    rss="$(ps -o rss= -p "$pid" 2>/dev/null | tr -d " " || echo 0)"
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

# Keep newest cursor-agent per workspace_key; also enforce global count cap.
cleanup_cursor_agents() {
  local killed_dup=0 killed_cap=0 kept=0
  local tmp
  tmp="$(mktemp)"
  # etimes pid key cmd
  ps -eo pid=,etimes=,args= 2>/dev/null | grep -E "[c]ursor-agent .* worker start" | while read -r pid etimes rest; do
    key="$(sed -n "s/.*workspace_key=\([^ ]*\).*/\1/p" <<<"$rest")"
    [[ -z "$key" ]] && key="unknown-$pid"
    printf "%s %s %s\n" "$etimes" "$pid" "$key"
  done | sort -k3,3 -k1,1n >"$tmp"

  local prev_key="" pid etimes key
  while read -r etimes pid key; do
    [[ -z "${pid:-}" ]] && continue
    if [[ "$key" == "$prev_key" ]]; then
      kill_pid "$pid" "cursor-agent:duplicate" "workspace_key=$key age_sec=$etimes" && killed_dup=$((killed_dup + 1))
    else
      prev_key="$key"
      kept=$((kept + 1))
    fi
  done <"$tmp"

  local count
  count="$(count_cmd "cursor-agent .* worker start")"
  if [[ "$count" -gt "$CURSOR_AGENT_MAX_COUNT" ]]; then
    log "cursor-agent count exceeded: count=$count > cap=$CURSOR_AGENT_MAX_COUNT; prune oldest to ~$CURSOR_AGENT_TARGET_COUNT"
    while read -r pid etimes rest; do
      count="$(count_cmd "cursor-agent .* worker start")"
      [[ "$count" -le "$CURSOR_AGENT_TARGET_COUNT" ]] && break
      kill_pid "$pid" "cursor-agent:cap" "age_sec=$etimes" && killed_cap=$((killed_cap + 1))
    done < <(ps -eo pid=,etimes=,args= 2>/dev/null | grep -E "[c]ursor-agent .* worker start" | sort -k2 -nr)
  fi

  rm -f "$tmp"
  count="$(count_cmd "cursor-agent .* worker start")"
  log "cursor-agent summary: killed_dup=$killed_dup killed_cap=$killed_cap kept_keys~$kept remaining=$count cap=$CURSOR_AGENT_MAX_COUNT"
}

# Kill stuck `pm2 update` CLI processes. A real update finishes in seconds; piles of
# these once consumed ~12GB RSS as 810 zombies. Never touches PM2 God Daemon or apps.
cleanup_pm2_update_zombies() {
  local pid etimes rss cmd
  local count killed_age=0 killed_cap=0 skipped_young=0
  local emergency=0

  count="$(pm2_update_count)"
  log "pm2-update baseline: count=$count max_age_sec=$PM2_UPDATE_MAX_AGE_SEC count_cap=$PM2_UPDATE_COUNT_CAP"

  if [[ "$count" -eq 0 ]]; then
    log "pm2-update summary: none found"
    return 0
  fi

  if [[ "$count" -ge "$PM2_UPDATE_COUNT_CAP" ]]; then
    emergency=1
    log "pm2-update count exceeded: count=$count >= cap=$PM2_UPDATE_COUNT_CAP; killing all"
  fi

  while read -r pid etimes rss cmd; do
    [[ -z "${pid:-}" ]] && continue
    # Never match PM2 God Daemon (cmdline is like "PM2 v6.0.14: God Daemon")
    if grep -qiE "God Daemon|PM2 v[0-9]" <<<"$cmd"; then
      continue
    fi
    # Require the literal CLI form: .../pm2 update  OR  pm2 update
    if ! grep -qE '(^|/)pm2 update' <<<"$cmd"; then
      continue
    fi

    if [[ "$emergency" -eq 1 ]]; then
      kill_pid "$pid" "pm2-update:count" "age_sec=$etimes rss_kb=$rss" && killed_cap=$((killed_cap + 1))
      continue
    fi

    if [[ "$etimes" -lt "$PM2_UPDATE_MAX_AGE_SEC" ]]; then
      skipped_young=$((skipped_young + 1))
      continue
    fi
    kill_pid "$pid" "pm2-update:max_age" "age_sec=$etimes rss_kb=$rss" && killed_age=$((killed_age + 1))
  done < <(ps -eo pid=,etimes=,rss=,args= 2>/dev/null | grep -E '[/]pm2 update|(^| )pm2 update' | grep -v grep || true)

  count="$(pm2_update_count)"
  log "pm2-update summary: killed_age=$killed_age killed_cap=$killed_cap skipped_young=$skipped_young remaining=$count"
}

cleanup_orphan_login_shells() {
  local pid etimes sid cmd killed=0 skipped=0
  while read -r pid etimes sid cmd; do
    [[ -z "${pid:-}" ]] && continue
    if [[ "$etimes" -lt "$MAX_AGE_SEC" ]]; then
      skipped=$((skipped + 1))
      continue
    fi
    # Skip if session looks protected
    if [[ -n "${sid:-}" && "$sid" != "?" && "$sid" != "-" ]] && session_has_protected_process "$sid"; then
      skipped=$((skipped + 1))
      continue
    fi
    kill_pid "$pid" "orphan-bash-l" "age_sec=$etimes sid=$sid" && killed=$((killed + 1))
  done < <(ps -eo pid=,etimes=,sid=,args= 2>/dev/null | grep -E "[/]bin/bash -l$|[/]usr/bin/bash -l$" || true)
  log "orphan-bash-l summary: killed=$killed skipped=$skipped"
}

cleanup_remote_sessions() {
  local line sid remote class state age terminated=0 skipped=0 age_limit
  if ! command -v loginctl >/dev/null 2>&1; then
    log "loginctl not available; skipping session cleanup"
    return
  fi

  while read -r line; do
    [[ -z "$line" ]] && continue
    sid="$(awk "{print \$1}" <<<"$line")"
    [[ -z "$sid" || "$sid" == "SESSION" ]] && continue

    remote="$(loginctl show-session "$sid" -p Remote --value 2>/dev/null || true)"
    class="$(loginctl show-session "$sid" -p Class --value 2>/dev/null || true)"
    state="$(loginctl show-session "$sid" -p State --value 2>/dev/null || true)"
    if [[ "$remote" != "yes" ]]; then
      skipped=$((skipped + 1))
      continue
    fi
    if [[ "$class" != "user" ]]; then
      skipped=$((skipped + 1))
      continue
    fi

    age="$(session_age_sec "$sid")"
    age_limit="$MAX_AGE_SEC"
    if [[ "$state" == "closing" ]]; then
      age_limit="$ABANDONED_MAX_AGE_SEC"
    fi
    if [[ "$age" -lt "$age_limit" ]]; then
      skipped=$((skipped + 1))
      continue
    fi

    if session_has_protected_process "$sid"; then
      skipped=$((skipped + 1))
      continue
    fi

    if [[ "$DRY_RUN" == "1" ]]; then
      log "dry-run: would terminate remote session $sid age_sec=$age class=$class state=$state limit=$age_limit"
      terminated=$((terminated + 1))
      continue
    fi

    if loginctl terminate-session "$sid" 2>/dev/null; then
      log "terminated remote session $sid age_sec=$age class=$class state=$state"
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
    if ! docker ps --format "{{.Names}}" 2>/dev/null | grep -q "^echo-postgres$"; then
      log "WARN: echo-postgres container not running after cleanup"
      ok=0
    fi
  fi
  if [[ "$ok" -eq 1 ]]; then
    log "post-check: echo-backend PM2 + echo-postgres docker OK (or tools unavailable)"
  fi
}

log "cleanup-stale-ssh start max_age_hours=$MAX_AGE_HOURS abandoned_max_age_hours=$ABANDONED_MAX_AGE_HOURS ssh_agent_cap_count=$SSH_AGENT_MAX_COUNT ssh_agent_cap_gb=$SSH_AGENT_MAX_RSS_GB cursor_agent_cap=$CURSOR_AGENT_MAX_COUNT pm2_update_max_age_sec=$PM2_UPDATE_MAX_AGE_SEC pm2_update_count_cap=$PM2_UPDATE_COUNT_CAP dry_run=$DRY_RUN"
log_inventory "before"
cleanup_pm2_update_zombies
cleanup_ssh_agents
cleanup_cursor_agents
cleanup_orphan_login_shells
cleanup_remote_sessions
verify_production_running
log_inventory "after"
log "cleanup-stale-ssh done"
