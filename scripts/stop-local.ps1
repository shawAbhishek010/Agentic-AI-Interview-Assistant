$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidPath = Join-Path $projectRoot '.runtime\pids.json'
if (-not (Test-Path -LiteralPath $pidPath)) { Write-Output 'No script-owned services were recorded.'; exit 0 }
$recordedServices = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
foreach ($recordedService in $recordedServices) {
    $runningService = Get-Process -Id $recordedService.id -ErrorAction SilentlyContinue
    if (-not $runningService) { continue }
    $commandInfo = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$recordedService.id)
    $recordedTime = [DateTime]::Parse($recordedService.started_at).ToUniversalTime()
    $sameStart = [Math]::Abs(($runningService.StartTime.ToUniversalTime() - $recordedTime).TotalSeconds) -lt 2
    if ($sameStart -and $commandInfo.CommandLine -like ('*' + $projectRoot + '*')) { Stop-Process -Id $recordedService.id; Write-Output ('Stopped owned service ' + $recordedService.id) }
    else { Write-Warning ('Process identity changed; left process ' + $recordedService.id + ' running.') }
}
Remove-Item -LiteralPath $pidPath
