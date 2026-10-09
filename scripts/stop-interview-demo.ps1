[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = 'Stop'
$demoRoot = Split-Path -Parent $PSScriptRoot
$demoMarker = Join-Path $demoRoot 'tmp/interview-demo-process.json'
$demoLegacyMarker = Join-Path $demoRoot 'tmp/interview-live-20261008.pid'

if (Test-Path -LiteralPath $demoMarker) {
    $demoProcessId = [int]((Get-Content -LiteralPath $demoMarker -Raw | ConvertFrom-Json).pid)
} elseif (Test-Path -LiteralPath $demoLegacyMarker) {
    $demoProcessId = [int](Get-Content -LiteralPath $demoLegacyMarker -Raw)
} else {
    Write-Output 'No recorded interview demo process. Use Ctrl+C in its terminal.'
    return
}

$demoProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $demoProcessId"
$demoListener = Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue |
    Where-Object OwningProcess -EQ $demoProcessId
$demoCommandMatches = $demoProcess -and (
    $demoProcess.CommandLine -match 'tmp[\\/]interview-demo-20261008\.mjs' -or (
        $demoProcess.CommandLine -match 'scripts[\\/]interactive-demo\.mjs' -and
        $demoProcess.CommandLine -match '--interview-session'
    )
)

if (-not $demoListener -or -not $demoCommandMatches) {
    Write-Output 'The recorded demo is already stopped or the process does not match. No process was terminated.'
    return
}

if ($PSCmdlet.ShouldProcess("Interview demo process $demoProcessId on port 3001", 'Stop')) {
    Stop-Process -Id $demoProcessId
    Write-Output 'Interview demo stopped. No more API calls can come from this process.'
}
