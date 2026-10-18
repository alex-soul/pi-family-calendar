# Requires Windows PowerShell 5.1+ and Windows OpenSSH. Uses your existing SSH key/agent.
[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,252}$')]
    [string]$SshTarget,
    [ValidateRange(1024,65535)][int]$LocalPort = 18775,
    [ValidateRange(1,65535)][int]$RemotePort = 8775,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
if (-not $SshTarget) {
    $SshTarget = Read-Host 'Pi SSH name (or user@address)'
    if ($SshTarget -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,252}$') { throw 'Enter a valid SSH name or user@address.' }
}
$sshPath = (Get-Command ssh.exe -ErrorAction Stop).Source
$probe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $LocalPort)
try { $probe.Start() } catch { throw "Port $LocalPort is already in use. Close the previous helper before trying again." }
finally { $probe.Stop() }

$tunnel = New-Object System.Diagnostics.Process
$tunnel.StartInfo.FileName = $sshPath
# Validated host/ports only, no shell command or remote command interpolation.
$tunnel.StartInfo.Arguments = "-N -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -L 127.0.0.1:${LocalPort}:127.0.0.1:${RemotePort} $SshTarget"
$tunnel.StartInfo.UseShellExecute = $false
$tunnel.StartInfo.CreateNoWindow = $true
$tunnel.StartInfo.RedirectStandardError = $true
$started = $false
try {
    $started = $tunnel.Start()
    $errors = $tunnel.StandardError.ReadToEndAsync()
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ($tunnel.HasExited) { throw 'SSH could not connect. Check your SSH key/agent and connect once with ssh to verify the host fingerprint.' }
        try {
            $health = Invoke-RestMethod "http://127.0.0.1:$LocalPort/healthz" -TimeoutSec 2
            if ($health.status -eq 'ok' -and $health.application -eq 'pi-family-calendar') { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready -or $tunnel.HasExited) { throw 'The calendar did not respond through SSH. Check that it is running and allows this helper port.' }
    Write-Host "Connected. Google callback: http://127.0.0.1:$LocalPort/api/google/callback"
    if (-not $CheckOnly) {
        Start-Process "http://127.0.0.1:$LocalPort/admin/google"
        Write-Host 'Keep this window open while connecting Google. Enter your admin PIN in the browser if requested.'
        [void](Read-Host 'When finished, press Enter to close the connection')
    }
} finally {
    if ($started -and -not $tunnel.HasExited) { $tunnel.Kill(); $tunnel.WaitForExit() }
    $tunnel.Dispose()
}
