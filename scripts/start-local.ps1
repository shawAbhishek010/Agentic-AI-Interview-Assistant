$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot '.runtime'
$pidPath = Join-Path $runtimeRoot 'pids.json'
$agentPython = Join-Path $projectRoot 'agent\.venv\Scripts\python.exe'
$apiJar = Join-Path $projectRoot 'backend\target\placement-api-1.0.0.jar'
$viteScript = Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js'
foreach ($requiredPath in @($agentPython,$apiJar,$viteScript)) { if (-not (Test-Path -LiteralPath $requiredPath)) { throw 'Run scripts/setup.ps1 before starting services.' } }
foreach ($servicePort in @(5173,8080,8001)) {
    $connection = [System.Net.Sockets.TcpClient]::new()
    try { $pending = $connection.ConnectAsync('127.0.0.1',$servicePort); if ($pending.Wait(300) -and $connection.Connected) { throw "Port $servicePort is already in use. Reuse that service or stop it before running this script." } }
    catch [System.AggregateException] { }
    finally { $connection.Dispose() }
}
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) {
    foreach ($line in Get-Content -LiteralPath $envPath) {
        if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1],$matches[2],'Process') }
    }
}
[Environment]::SetEnvironmentVariable('SPRING_PROFILES_ACTIVE','local','Process')
[Environment]::SetEnvironmentVariable('DEBUG','false','Process')
[Environment]::SetEnvironmentVariable('LANGSMITH_TRACING','false','Process')
[Environment]::SetEnvironmentVariable('LANGCHAIN_TRACING_V2','false','Process')
$startedServices = @()
try {
    $agentProcess = Start-Process -FilePath $agentPython -ArgumentList @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8001') -WorkingDirectory (Join-Path $projectRoot 'agent') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot 'agent.out.log') -RedirectStandardError (Join-Path $runtimeRoot 'agent.err.log')
    $startedServices += $agentProcess
    $apiProcess = Start-Process -FilePath (Get-Command java).Source -ArgumentList @('-jar',('"' + $apiJar + '"')) -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot 'api.out.log') -RedirectStandardError (Join-Path $runtimeRoot 'api.err.log')
    $startedServices += $apiProcess
    $webProcess = Start-Process -FilePath (Get-Command node).Source -ArgumentList @(('"' + $viteScript + '"'),'--host','127.0.0.1','--port','5173','--strictPort') -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot 'web.out.log') -RedirectStandardError (Join-Path $runtimeRoot 'web.err.log')
    $startedServices += $webProcess
    $startedServices | ForEach-Object { @{id=$_.Id;started_at=$_.StartTime.ToUniversalTime().ToString('o')} } | ConvertTo-Json | Set-Content -LiteralPath $pidPath -Encoding UTF8
} catch { foreach ($startedService in $startedServices) { Stop-Process -Id $startedService.Id -ErrorAction SilentlyContinue }; throw }
$ready = $false
for ($attempt=0; $attempt -lt 30; $attempt++) {
    try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/health' -TimeoutSec 3; if ($health.agent_status -eq 'ok') { $ready=$true; break } } catch { }
    if ($attempt % 5 -eq 0) { Write-Output 'Waiting for Placement AI services...' }
    Start-Sleep -Seconds 2
}
if (-not $ready) { throw 'Services did not become ready. Inspect .runtime/*.log; use scripts/stop-local.ps1 to stop the recorded processes.' }
Write-Output 'Placement AI: http://127.0.0.1:5173'
Write-Output 'API: http://127.0.0.1:8080/api/health | Agent docs: http://127.0.0.1:8001/docs'
Write-Output 'Use Explore demo workspace, or sign in. Run scripts/stop-local.ps1 when finished.'
