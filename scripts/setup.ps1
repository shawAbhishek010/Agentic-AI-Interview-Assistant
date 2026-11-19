$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw 'Install uv from https://docs.astral.sh/uv/getting-started/installation/ before setup.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.12+ before setup.' }
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'Install JDK 17 or newer before setup.' }
Push-Location (Join-Path $projectRoot 'agent')
try { uv sync --python 3.12 --frozen --extra voice; if ($LASTEXITCODE -ne 0) { throw 'Python dependency setup failed.' } } finally { Pop-Location }
Push-Location (Join-Path $projectRoot 'frontend')
try { npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency setup failed.' } } finally { Pop-Location }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'maven.ps1') '-B' '-q' 'package'
if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
Write-Output 'Setup complete. Run scripts/start-local.ps1 to start the three local services.'
