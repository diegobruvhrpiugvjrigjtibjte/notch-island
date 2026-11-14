# Agente persistente per le informazioni: brano in riproduzione, copertina, elenco app, monitor di sistema.
# Ingresso: righe "id comando [argomento]". Uscita: JSON (con id = risposta; con ev = evento periodico).
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -TypeDefinition @'
using System;using System.Threading;using System.Collections.Concurrent;
public static class Q{ public static ConcurrentQueue<string> L=new ConcurrentQueue<string>();
 public static void Start(){var t=new Thread(()=>{string s;while((s=Console.In.ReadLine())!=null)L.Enqueue(s);L.Enqueue("0 quit");});t.IsBackground=true;t.Start();}}
'@
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $m = $asTask.MakeGenericMethod($type); $t = $m.Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$tMgr = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$tProps = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$tStream = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

function Out($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 6)); [Console]::Out.Flush() }

$mgr = $null
function Session { if (-not $script:mgr) { $script:mgr = Await ($tMgr::RequestAsync()) $tMgr }; $script:mgr.GetCurrentSession() }
function Now {
  $s = Session; if (-not $s) { return @{} }
  $p = Await ($s.TryGetMediaPropertiesAsync()) $tProps
  $tl = $s.GetTimelineProperties(); $pb = $s.GetPlaybackInfo()
  $playing = ($pb.PlaybackStatus -eq 4)
  $dur = ($tl.EndTime - $tl.StartTime).TotalSeconds
  $pos = ($tl.Position - $tl.StartTime).TotalSeconds
  # La posizione SMTC resta ferma all'ultimo aggiornamento dell'app: aggiungiamo il tempo trascorso da allora
  if ($playing) { $el = ((Get-Date).ToUniversalTime() - $tl.LastUpdatedTime.UtcDateTime).TotalSeconds; if ($el -gt 0 -and $el -lt 36000) { $pos += $el } }
  if ($dur -gt 0 -and $pos -gt $dur) { $pos = $dur }
  $c = $pb.Controls
  @{ title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; playing = $playing; pos = [Math]::Round($pos, 2); dur = [Math]::Round($dur, 2); app = $s.SourceAppUserModelId; canNext = [bool]$c.IsNextEnabled; canPrev = [bool]$c.IsPreviousEnabled; canSeek = [bool]$c.IsPlaybackPositionEnabled }
}
# Comandi diretti alla sessione multimediale (piu' affidabili dei tasti multimediali: vanno all'app giusta)
function Media($act) {
  $s = Session; if (-not $s) { return $false }
  switch ($act) {
    'next'   { return [bool](Await ($s.TrySkipNextAsync()) ([bool])) }
    'prev'   { return [bool](Await ($s.TrySkipPreviousAsync()) ([bool])) }
    'play'   { return [bool](Await ($s.TryPlayAsync()) ([bool])) }
    'pause'  { return [bool](Await ($s.TryPauseAsync()) ([bool])) }
    'toggle' { return [bool](Await ($s.TryTogglePlayPauseAsync()) ([bool])) }
  }
  $false
}
function Seek($sec) {
  $s = Session; if (-not $s) { return $false }
  [bool](Await ($s.TryChangePlaybackPositionAsync([long]([double]$sec * 10000000))) ([bool]))
}
function Thumb {
  $s = Session; if (-not $s) { return '' }
  $p = Await ($s.TryGetMediaPropertiesAsync()) $tProps
  if (-not $p.Thumbnail) { return '' }
  $st = Await ($p.Thumbnail.OpenReadAsync()) $tStream
  $tIras = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead([Windows.Storage.Streams.IRandomAccessStream]$st)
  $ms = New-Object IO.MemoryStream; $net.CopyTo($ms); $bytes = $ms.ToArray()
  $mime = $st.ContentType; if (-not $mime) { $mime = 'image/jpeg' }
  'data:' + $mime + ';base64,' + [Convert]::ToBase64String($bytes)
}

# --- elenco applicazioni (collegamenti del menu Start + app dello Store)
function Apps {
  $sh = New-Object -ComObject WScript.Shell
  $dirs = @("$env:ProgramData\Microsoft\Windows\Start Menu\Programs", "$env:APPDATA\Microsoft\Windows\Start Menu\Programs")
  $seen = @{}; $out = @()
  foreach ($d in $dirs) {
    Get-ChildItem $d -Recurse -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
      $n = $_.BaseName
      if ($n -match '(?i)uninstall|disinstalla|rimuovi|readme|leggimi|\bhelp\b|guida|documentation|license|licenza|manual|website|sito web') { return }
      $k = $n.ToLower(); if ($seen[$k]) { return }
      $t = $sh.CreateShortcut($_.FullName).TargetPath
      $seen[$k] = $true; $out += @{ name = $n; lnk = $_.FullName; target = $t }
    }
  }
  Get-StartApps -ErrorAction SilentlyContinue | Where-Object { $_.AppID -match '!' } | ForEach-Object {
    $k = $_.Name.ToLower(); if ($seen[$k]) { return }
    $seen[$k] = $true; $out += @{ name = $_.Name; appid = $_.AppID }
  }
  $out | Sort-Object { $_.name }
}

# --- monitor di sistema
$monOn = $false; $lastMon = [DateTime]::MinValue; $prevNet = $null; $prevProc = @{}; $prevT = $null; $gpu = $null; $lastGpu = [DateTime]::MinValue
$cores = [Environment]::ProcessorCount
function Mon {
  $now = Get-Date
  # rete (byte ricevuti / inviati sommando le interfacce attive)
  $rx = 0; $tx = 0
  foreach ($n in [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($n.OperationalStatus -eq 'Up' -and $n.NetworkInterfaceType -ne 'Loopback') { $s = $n.GetIPv4Statistics(); $rx += $s.BytesReceived; $tx += $s.BytesSent }
  }
  $down = 0; $up = 0
  if ($prevNet -and $prevT) { $dt = ($now - $prevT).TotalSeconds; if ($dt -gt 0) { $down = [Math]::Max(0, ($rx - $prevNet[0]) / $dt); $up = [Math]::Max(0, ($tx - $prevNet[1]) / $dt) } }
  # processi: CPU % dal delta del tempo processore
  $procs = @(); $cur = @{}
  Get-Process | ForEach-Object { if ($_.Id -gt 4) { $cur[$_.Id] = $_.CPU; if ($prevProc.ContainsKey($_.Id) -and $prevT) {
        $dt = ($now - $prevT).TotalSeconds; $d = $_.CPU - $prevProc[$_.Id]
        if ($dt -gt 0 -and $d -gt 0) { $procs += @{ name = $_.ProcessName; cpu = [Math]::Round(100 * $d / ($dt * $cores), 1); ram = [Math]::Round($_.WorkingSet64 / 1MB) } } } } }
  $top = $procs | Sort-Object { -$_.cpu } | Select-Object -First 4
  $ramTop = Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 1 | ForEach-Object { @{ name = $_.ProcessName; ram = [Math]::Round($_.WorkingSet64 / 1MB) } }
  # GPU (ogni 3 secondi, costoso)
  if (($now - $lastGpu).TotalSeconds -ge 3) {
    $c = (Get-Counter '\GPU Engine(*engtype_3D)\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples
    if ($c) { $script:gpu = [Math]::Min(100, [Math]::Round(($c | Measure-Object CookedValue -Sum).Sum)) }
    $script:lastGpu = $now
  }
  # temperatura (solo se esposta dal sistema)
  $temp = $null
  $z = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($z) { $temp = [Math]::Round($z.CurrentTemperature / 10 - 273.15) }
  $script:prevNet = @($rx, $tx); $script:prevProc = $cur; $script:prevT = $now
  Out @{ ev = 'mon'; down = [Math]::Round($down); up = [Math]::Round($up); top = @($top); ramTop = $ramTop; gpu = $gpu; temp = $temp }
}

[Q]::Start()
while ($true) {
  $line = $null
  while ([Q]::L.TryDequeue([ref]$line)) {
    $p = $line.Split(' ', 3); $id = [int]$p[0]; $cmd = $p[1]; $arg = $p[2]
    try {
      switch ($cmd) {
        'now'   { $r = Now; $r.id = $id; Out $r }
        'media' { Out @{ id = $id; ok = (Media $arg) } }
        'seek'  { Out @{ id = $id; ok = (Seek $arg) } }
        'thumb' { Out @{ id = $id; img = (Thumb) } }
        'apps'  { Out @{ id = $id; apps = @(Apps) } }
        'mon'   { $script:monOn = ($arg -eq 'on'); $script:prevT = $null; Out @{ id = $id; ok = $true } }
        'quit'  { exit }
        default { Out @{ id = $id; error = 'unknown' } }
      }
    } catch { Out @{ id = $id; error = "$($_.Exception.Message)" } }
  }
  if ($monOn -and ((Get-Date) - $lastMon).TotalSeconds -ge 2) { $lastMon = Get-Date; try { Mon } catch {} }
  Start-Sleep -Milliseconds 120
}
