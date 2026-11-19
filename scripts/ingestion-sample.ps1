$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location (Join-Path $projectRoot 'agent')
try {
    uv run python -m app.ingestion_sample
    if ($LASTEXITCODE -ne 0) { throw 'Ingestion sample failed.' }
} finally { Pop-Location }
