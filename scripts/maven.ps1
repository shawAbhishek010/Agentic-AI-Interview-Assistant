$ErrorActionPreference = 'Stop'
$mavenArguments = $args
$projectRoot = Split-Path -Parent $PSScriptRoot
$mavenVersion = '3.9.11'
$toolRoot = Join-Path $projectRoot '.tools'
$mavenPath = Join-Path $toolRoot "apache-maven-$mavenVersion\bin\mvn.cmd"
if (-not (Test-Path -LiteralPath $mavenPath)) {
    New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
    $archivePath = Join-Path $toolRoot "apache-maven-$mavenVersion-bin.zip"
    $downloadUrl = "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$mavenVersion/apache-maven-$mavenVersion-bin.zip"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath
    $expectedChecksum = (Invoke-WebRequest -Uri ($downloadUrl + '.sha512') -UseBasicParsing).Content.Trim().Split(' ')[0]
    if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA512).Hash -ne $expectedChecksum) { throw 'Maven download checksum mismatch. Installation stopped.' }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $toolRoot -Force
}
Push-Location (Join-Path $projectRoot 'backend')
try { & $mavenPath @mavenArguments; $mavenExit = $LASTEXITCODE } finally { Pop-Location }
exit $mavenExit
