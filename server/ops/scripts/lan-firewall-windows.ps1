# Opens inbound ports for Echo LAN dev (Vite, API, LiveKit, TURN, RTP).
# Run once in an elevated PowerShell: npm run lan:firewall
# Requires Windows 8+ / PowerShell with NetSecurity module.

$ErrorActionPreference = 'Stop'

$isAdmin = (
  [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Error 'Run this script as Administrator (right-click PowerShell, Run as administrator), or from an elevated terminal.'
  exit 1
}

function Remove-EchoFirewallRuleIfExists {
  param([string]$DisplayName)
  Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue
}

# Legacy UDP range (LiveKit used 50000-50100 before Windows bind conflicts).
Remove-EchoFirewallRuleIfExists -DisplayName 'Echo Dev LAN (UDP: LiveKit RTP)'
Remove-EchoFirewallRuleIfExists -DisplayName 'Echo Dev LAN UDP 50000-50100 (LiveKit RTP)'

# One port (or one range like 57000-57100) per rule: New-NetFirewallRule does not accept "8080,3000" as a single string.
$rules = @(
  @{ Name = 'Echo Dev LAN TCP 8080 (Vite)'; Protocol = 'TCP'; LocalPort = '8080' },
  @{ Name = 'Echo Dev LAN TCP 3000 (API, Socket.IO)'; Protocol = 'TCP'; LocalPort = '3000' },
  @{ Name = 'Echo Dev LAN TCP 7880 (LiveKit WS)'; Protocol = 'TCP'; LocalPort = '7880' },
  @{ Name = 'Echo Dev LAN TCP 7881 (LiveKit RTC TCP)'; Protocol = 'TCP'; LocalPort = '7881' },
  @{ Name = 'Echo Dev LAN UDP 3478 (TURN)'; Protocol = 'UDP'; LocalPort = '3478' },
  @{ Name = 'Echo Dev LAN UDP 57000-57100 (LiveKit RTP)'; Protocol = 'UDP'; LocalPort = '57000-57100' }
)

foreach ($r in $rules) {
  Remove-EchoFirewallRuleIfExists -DisplayName $r.Name
  New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow `
    -Profile Private,Domain -Protocol $r.Protocol -LocalPort $r.LocalPort | Out-Null
  Write-Host ('OK: ' + $r.Name)
}

Write-Host ''
Write-Host 'Firewall rules added for Private and Domain profiles. For Public Wi-Fi, set the network to Private or edit the rules to include the Public profile.'
