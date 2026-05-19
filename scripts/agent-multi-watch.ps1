# Logs git working-tree snapshots every 5 minutes for 12 intervals (~1 hour).
# Log file is *.log (gitignored). Usage: pwsh -File scripts/agent-multi-watch.ps1

# Git writes line-ending hints to stderr; do not treat those as terminating errors.
$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$log = Join-Path $repo "agent-multi-watch.log"
$prevPorcelain = @()
$prevStatSig = ""

function Get-StatSignature {
  $u = git diff --stat 2>$null | Out-String
  $s = git diff --cached --stat 2>$null | Out-String
  return ($u + "`n---CACHED---`n" + $s)
}

for ($i = 1; $i -le 12; $i++) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss K"
  $curPorcelain = @(git status --porcelain 2>$null)
  $statSig = Get-StatSignature

  Add-Content -Path $log -Value ""
  Add-Content -Path $log -Value "========== Interval $i / 12 - $ts =========="

  if ($i -eq 1) {
    Add-Content -Path $log -Value "Baseline (no previous snapshot)."
  }
  else {
    Add-Content -Path $log -Value "Delta vs previous git status --porcelain line:"
    $prevSet = [System.Collections.Generic.HashSet[string]]::new(
      [string[]]$prevPorcelain,
      [System.StringComparer]::Ordinal
    )
    $curSet = [System.Collections.Generic.HashSet[string]]::new(
      [string[]]$curPorcelain,
      [System.StringComparer]::Ordinal
    )
    $added = @($curPorcelain | Where-Object { -not $prevSet.Contains($_) })
    $removed = @($prevPorcelain | Where-Object { -not $curSet.Contains($_) })
    if ($added.Count -eq 0 -and $removed.Count -eq 0) {
      Add-Content -Path $log -Value "  (same porcelain paths and status codes as last tick)"
    }
    else {
      foreach ($l in $added) { Add-Content -Path $log -Value "  + $l" }
      foreach ($l in $removed) { Add-Content -Path $log -Value "  - $l" }
    }

    if ($statSig -eq $prevStatSig) {
      Add-Content -Path $log -Value "Diff stat vs previous: unchanged (no new hunks in diff --stat)"
    }
    else {
      Add-Content -Path $log -Value "Diff stat vs previous: CHANGED (files edited or stage changed)"
      Add-Content -Path $log -Value "--- git diff --stat ---"
      Add-Content -Path $log -Value (git diff --stat 2>$null | Out-String)
      Add-Content -Path $log -Value "--- git diff --cached --stat ---"
      Add-Content -Path $log -Value (git diff --cached --stat 2>$null | Out-String)
    }
  }

  Add-Content -Path $log -Value "--- Full git status --porcelain ($($curPorcelain.Count) lines) ---"
  if ($curPorcelain.Count -eq 0) {
    Add-Content -Path $log -Value "  (clean)"
  }
  else {
    $curPorcelain | ForEach-Object { Add-Content -Path $log -Value $_ }
  }

  $prevPorcelain = $curPorcelain
  $prevStatSig = $statSig

  if ($i -lt 12) {
    Start-Sleep -Seconds 300
  }
}

Add-Content -Path $log -Value ""
Add-Content -Path $log -Value "========== Watch finished - $((Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')) =========="
