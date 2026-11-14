# Genera un file audio parlato (voce italiana di Windows) per provare il microfono senza parlare.
param([string]$Out, [string]$Text = 'che ore sono')
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'it*' } | Select-Object -First 1
if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }
$pb = New-Object System.Speech.Synthesis.PromptBuilder
$pb.AppendBreak([TimeSpan]::FromMilliseconds(600))
$pb.AppendText($Text)
$pb.AppendBreak([TimeSpan]::FromMilliseconds(3500))
$s.SetOutputToWaveFile($Out)
$s.Speak($pb); $s.Dispose()
"voce: " + $(if ($v) { $v.VoiceInfo.Name } else { 'predefinita' })
