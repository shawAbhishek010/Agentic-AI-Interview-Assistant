$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$voiceRoot = Join-Path $projectRoot '.models\piper'
New-Item -ItemType Directory -Force -Path $voiceRoot | Out-Null
$voiceBase = 'https://huggingface.co/rhasspy/piper-voices/resolve/e9ab671f2a0e50a701b34361136ba3e6a3a9eb0c/en/en_US/mike/medium/'
$voiceFiles = @(
    @{Name='en_US-mike-medium.onnx';Hash='6876866e3dfadc7f044bc5e4fbac16c47b5a1e79eaec04e3bb0c2c6e9da8a857'},
    @{Name='en_US-mike-medium.onnx.json';Hash='57893c9e492cc6650e2a91e26ec7aa3bf23c267c080649f7cfb6aa1843fcd6ed'}
)
foreach ($voiceFile in $voiceFiles) {
    $destination = Join-Path $voiceRoot $voiceFile.Name
    if (-not (Test-Path -LiteralPath $destination)) {
        & curl.exe --fail --location --retry 3 --connect-timeout 20 --output $destination ($voiceBase + $voiceFile.Name)
        if ($LASTEXITCODE -ne 0) { throw 'Local voice download failed. Rerun the preparation script.' }
    }
    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $voiceFile.Hash) { throw ('Voice file checksum mismatch: ' + $voiceFile.Name) }
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'data\model-licenses\PIPER-MODEL-CARD.txt') -Destination (Join-Path $voiceRoot 'MODEL_CARD') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'data\model-licenses\PIPER-NOTICE.txt') -Destination (Join-Path $voiceRoot 'NOTICE.txt') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'data\model-licenses\PIPER-LICENSE.txt') -Destination (Join-Path $voiceRoot 'LICENSE.txt') -Force
Write-Output 'Local Piper voice and configuration verified. No paid speech service is used.'
