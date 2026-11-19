$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$modelRoot = Join-Path $projectRoot '.models'
$modelName = 'Llama-3.2-3B-Instruct-Q4_K_M.gguf'
$modelPath = Join-Path $modelRoot $modelName
$partialPath = $modelPath + '.part'
$revision = '5ab33fa94d1d04e903623ae72c95d1696f09f9e8'
$expectedHash = '6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff'
$modelUrl = "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/$revision/$modelName"
New-Item -ItemType Directory -Force -Path $modelRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'data\model-licenses\LLAMA-3.2-LICENSE.txt') -Destination (Join-Path $modelRoot 'LLAMA-3.2-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'data\model-licenses\NOTICE.txt') -Destination (Join-Path $modelRoot 'NOTICE.txt') -Force
if (Test-Path -LiteralPath $modelPath) {
    if ((Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash.ToLowerInvariant() -eq $expectedHash) { Write-Output 'Verified existing Llama-3.2-3B-Instruct Q4_K_M weights.'; exit 0 }
    throw 'Existing model checksum differs from the pinned source. Preserve it for inspection; no overwrite was performed.'
}
Write-Output 'Downloading the public 2.02 GB Llama-3.2-3B-Instruct Q4_K_M model for local CPU inference.'
Write-Output 'Model terms: data/model-licenses/LLAMA-3.2-LICENSE.txt. No hosted API or billing is used.'
& curl.exe --fail --location --retry 3 --connect-timeout 20 --continue-at - --output $partialPath $modelUrl
if ($LASTEXITCODE -ne 0) { throw 'Model download failed. Rerun this script to resume the partial download.' }
if ((Get-FileHash -LiteralPath $partialPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Model SHA-256 verification failed. Inference setup stopped.' }
Move-Item -LiteralPath $partialPath -Destination $modelPath
Write-Output 'Llama-3.2-3B weights downloaded and SHA-256 verified. Use the optional local-SLM Compose configuration to run them.'
