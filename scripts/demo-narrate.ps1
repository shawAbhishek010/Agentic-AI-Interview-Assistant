param([Parameter(Mandatory=$true)][string]$ManifestPath,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$voice = New-Object -ComObject SAPI.SpVoice
$voice.Rate = 1
$selectedVoice = $voice.GetVoices() | Where-Object { $_.GetDescription() -like '*Zira*' } | Select-Object -First 1
if ($selectedVoice) { $voice.Voice = $selectedVoice }
foreach ($chapter in $manifest.chapters) {
    $audioPath = Join-Path $OutputDirectory ($chapter.id + '.wav')
    $audioStream = New-Object -ComObject SAPI.SpFileStream
    try {
        $audioStream.Open($audioPath,3,$false)
        $voice.AudioOutputStream = $audioStream
        [void]$voice.Speak($chapter.narration)
    } finally { $audioStream.Close() }
}
Write-Output ('Prepared ' + $manifest.chapters.Count + ' offline SAPI narration chapters. No hosted speech service was used.')
