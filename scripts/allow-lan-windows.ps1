#Requires -RunAsAdministrator
param(
    [Parameter(Mandatory = $true)][System.Net.IPAddress]$Address,
    [Parameter(Mandatory = $true)][string]$Subnet
)
$ErrorActionPreference = 'Stop'
if ($Address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or $Address.ToString() -eq '0.0.0.0') { throw 'Use the specific LAN IPv4 address.' }
if ($Subnet -notmatch '^\d{1,3}(\.\d{1,3}){3}/(\d|[12]\d|3[0-2])$') { throw 'Use a home subnet in IPv4 CIDR form.' }
$ruleName = 'PiFamilyCalendar-Dev-LAN'
$existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Set-NetFirewallRule -Name $ruleName -Enabled True -Direction Inbound -Action Allow -Profile Private -Protocol TCP -LocalPort 8775 -LocalAddress $Address.ToString() -RemoteAddress $Subnet | Out-Null
} else {
    New-NetFirewallRule -Name $ruleName -DisplayName 'Pi Family Calendar DEV (home LAN)' -Enabled True -Direction Inbound -Action Allow -Profile Private -Protocol TCP -LocalPort 8775 -LocalAddress $Address.ToString() -RemoteAddress $Subnet | Out-Null
}
Write-Host 'Calendar access allowed from the specified home subnet on Private networks.'
