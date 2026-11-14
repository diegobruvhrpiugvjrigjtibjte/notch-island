# Agente persistente per i controlli di sistema (compila il codice nativo una sola volta, poi risponde in pochi ms).
# Ingresso: righe "id comando [argomento]". Uscita: una riga JSON per risposta, con lo stesso id.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -TypeDefinition @'
using System;using System.Collections.Generic;using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAEV{
 int RegisterControlChangeNotify(IntPtr p);int UnregisterControlChangeNotify(IntPtr p);int GetChannelCount(out uint n);
 int SetMasterVolumeLevel(float l,ref Guid g);int SetMasterVolumeLevelScalar(float l,ref Guid g);
 int GetMasterVolumeLevel(out float l);int GetMasterVolumeLevelScalar(out float l);
 int SetChannelVolumeLevel(uint c,float l,ref Guid g);int SetChannelVolumeLevelScalar(uint c,float l,ref Guid g);
 int GetChannelVolumeLevel(uint c,out float l);int GetChannelVolumeLevelScalar(uint c,out float l);
 int SetMute([MarshalAs(UnmanagedType.Bool)]bool m,ref Guid g);int GetMute([MarshalAs(UnmanagedType.Bool)]out bool m);}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMD{int Activate(ref Guid i,int c,IntPtr p,[MarshalAs(UnmanagedType.IUnknown)]out object o);}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDE{int EnumAudioEndpoints(int f,int m,out IntPtr c);int GetDefaultAudioEndpoint(int f,int r,out IMMD d);}
[ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]class MMDE{}

public static class Audio{
 static IAEV Ep(int flow){var e=(IMMDE)new MMDE();IMMD d;e.GetDefaultAudioEndpoint(flow,1,out d);var g=typeof(IAEV).GUID;object o;d.Activate(ref g,23,IntPtr.Zero,out o);return (IAEV)o;}
 public static string Get(int flow){try{var v=Ep(flow);float l;bool m;v.GetMasterVolumeLevelScalar(out l);v.GetMute(out m);return ((int)Math.Round(l*100)).ToString()+","+(m?"1":"0");}catch{return "-1,0";}}
 public static void Set(int flow,int pct){var v=Ep(flow);var g=Guid.Empty;v.SetMasterVolumeLevelScalar(Math.Max(0,Math.Min(100,pct))/100f,ref g);if(pct>0&&flow==0){v.SetMute(false,ref g);}}
 public static string Toggle(int flow){var v=Ep(flow);var g=Guid.Empty;bool m;v.GetMute(out m);v.SetMute(!m,ref g);return !m?"1":"0";}
}

public static class Mon{
 delegate bool MEP(IntPtr h,IntPtr dc,IntPtr r,IntPtr d);
 [DllImport("user32.dll")]static extern bool EnumDisplayMonitors(IntPtr dc,IntPtr c,MEP p,IntPtr d);
 [DllImport("dxva2.dll")]static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr h,out uint n);
 [DllImport("dxva2.dll")]static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr h,uint n,[Out]PM[] a);
 [DllImport("dxva2.dll")]static extern bool GetMonitorBrightness(IntPtr h,out uint mn,out uint cu,out uint mx);
 [DllImport("dxva2.dll")]static extern bool SetMonitorBrightness(IntPtr h,uint v);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct PM{public IntPtr h;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string d;}
 static List<IntPtr> hs;
 static void Init(){if(hs!=null)return;hs=new List<IntPtr>();
  EnumDisplayMonitors(IntPtr.Zero,IntPtr.Zero,(h,dc,r,d)=>{uint n;if(GetNumberOfPhysicalMonitorsFromHMONITOR(h,out n)&&n>0){var a=new PM[n];if(GetPhysicalMonitorsFromHMONITOR(h,n,a))foreach(var p in a)hs.Add(p.h);}return true;},IntPtr.Zero);}
 public static int Get(){Init();foreach(var h in hs){uint mn,cu,mx;if(GetMonitorBrightness(h,out mn,out cu,out mx)&&mx>mn)return (int)Math.Round(100.0*(cu-mn)/(mx-mn));}return -1;}
 public static bool Set(int pct){Init();bool ok=false;foreach(var h in hs){uint mn,cu,mx;if(GetMonitorBrightness(h,out mn,out cu,out mx)&&mx>mn){if(SetMonitorBrightness(h,(uint)(mn+(mx-mn)*Math.Max(0,Math.Min(100,pct))/100.0)))ok=true;}}return ok;}
}
public static class Kb{
 [DllImport("user32.dll")]public static extern void keybd_event(byte b,byte s,int f,int e);
 public static void Tap(byte k){keybd_event(k,0,0,0);keybd_event(k,0,2,0);}
}
'@

# --- luminosita': prima WMI (portatili), poi DDC/CI (monitor esterni)
$script:brMode = $null
function BrGet {
  if ($script:brMode -ne 'ddc') {
    $w = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($w) { $script:brMode = 'wmi'; return [int]$w.CurrentBrightness }
  }
  $v = [Mon]::Get(); if ($v -ge 0) { $script:brMode = 'ddc' }; return $v
}
function BrSet([int]$p) {
  if ($script:brMode -eq 'wmi') { (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Select-Object -First 1).WmiSetBrightness(1, $p) | Out-Null }
  else { [Mon]::Set($p) | Out-Null }
}

# --- radio (Wi-Fi / Bluetooth) tramite WinRT
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $m = $asTask.MakeGenericMethod($type); $t = $m.Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
function Radios($kind) {
  $list = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
  $list | Where-Object { $_.Kind.ToString() -eq $kind }
}

function Out($id, $o) { $o.id = [int]$id; [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
$keys = @{ playpause = 0xB3; next = 0xB0; prev = 0xB1; volup = 0xAF; voldown = 0xAE; mute = 0xAD }

while (($line = [Console]::In.ReadLine()) -ne $null) {
  $p = $line.Split(' ', 3); $id = $p[0]; $cmd = $p[1]; $arg = $p[2]
  try {
    switch ($cmd) {
      'ping'    { Out $id @{ ok = $true } }
      'key'     { if ($keys.ContainsKey($arg)) { [Kb]::Tap([byte]$keys[$arg]) }; Out $id @{ ok = $true } }
      'vol'     { $r = [Audio]::Get(0).Split(','); Out $id @{ v = [int]$r[0]; m = ($r[1] -eq '1') } }
      'volset'  { [Audio]::Set(0, [int]$arg); $r = [Audio]::Get(0).Split(','); Out $id @{ v = [int]$r[0]; m = ($r[1] -eq '1') } }
      'volmute' { $m = [Audio]::Toggle(0); Out $id @{ m = ($m -eq '1') } }
      'mic'     { $r = [Audio]::Get(1).Split(','); Out $id @{ v = [int]$r[0]; m = ($r[1] -eq '1') } }
      'micmute' { $m = [Audio]::Toggle(1); Out $id @{ m = ($m -eq '1') } }
      'br'      { Out $id @{ v = (BrGet) } }
      'brset'   { if ($null -eq $script:brMode) { [void](BrGet) }; BrSet ([int]$arg); Out $id @{ v = [int]$arg } }
      'radio'   { $r = @(Radios $arg); if ($r.Count) { Out $id @{ on = ($r[0].State.ToString() -eq 'On'); ok = $true } } else { Out $id @{ ok = $false } } }
      'radioset' {
        $a = $arg.Split(' '); $r = @(Radios $a[0])
        if ($r.Count) {
          $st = if ($a[1] -eq 'on') { [Windows.Devices.Radios.RadioState]::On } else { [Windows.Devices.Radios.RadioState]::Off }
          $res = Await ($r[0].SetStateAsync($st)) ([Windows.Devices.Radios.RadioAccessStatus])
          Out $id @{ ok = ($res.ToString() -eq 'Allowed'); on = ($a[1] -eq 'on') }
        } else { Out $id @{ ok = $false } }
      }
      'shot'    {
        $b = [Windows.Forms.SystemInformation]::VirtualScreen
        $bm = New-Object Drawing.Bitmap $b.Width, $b.Height
        $g = [Drawing.Graphics]::FromImage($bm); $g.CopyFromScreen($b.Location, [Drawing.Point]::Empty, $b.Size)
        $f = Join-Path ([Environment]::GetFolderPath('MyPictures')) ('Screenshot-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.png')
        $bm.Save($f); $g.Dispose(); $bm.Dispose(); Out $id @{ file = $f }
      }
      default   { Out $id @{ error = 'unknown' } }
    }
  } catch { Out $id @{ error = "$($_.Exception.Message)" } }
}
