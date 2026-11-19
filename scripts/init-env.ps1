param([string]$AdminEmail = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) { Write-Output '.env already exists; existing secrets were preserved.'; exit 0 }
function New-Secret {
    $randomBytes = New-Object byte[] 48
    $randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $randomGenerator.GetBytes($randomBytes) } finally { $randomGenerator.Dispose() }
    return [Convert]::ToBase64String($randomBytes).Replace('+','-').Replace('/','_').TrimEnd('=')
}
$content = Get-Content -LiteralPath (Join-Path $projectRoot '.env.example') -Raw
$content = $content.Replace('INTERNAL_SERVICE_TOKEN=',('INTERNAL_SERVICE_TOKEN=' + (New-Secret)))
$content = $content.Replace('JWT_SECRET=',('JWT_SECRET=' + (New-Secret)))
$content = $content.Replace('POSTGRES_PASSWORD=',('POSTGRES_PASSWORD=' + (New-Secret)))
if ($AdminEmail) {
    if ($AdminEmail -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') { throw 'Supply a valid administrator email address.' }
    $content = $content.Replace('ADMIN_EMAIL=',('ADMIN_EMAIL=' + $AdminEmail))
    $content = $content.Replace('ADMIN_PASSWORD=',('ADMIN_PASSWORD=' + (New-Secret)))
}
[System.IO.File]::WriteAllText($envPath,$content,[System.Text.UTF8Encoding]::new($false))
Write-Output 'Created ignored .env with unique local secrets. No paid provider is enabled.'
if ($AdminEmail) { Write-Output 'Administrator credentials are in .env; do not commit or share that file.' }
