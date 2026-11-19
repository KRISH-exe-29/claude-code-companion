# Prints "<hwnd>`t<process>`t<left,top,right,bottom>`t<title>" whenever the foreground window, its bounds or its title change.
# Read by main.js to park the companion when the user switches windows or browser tabs.
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Fg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rt, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
}
"@
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8  # keep title glyphs like the Claude marker
$last = ''
$lastHwnd = [IntPtr]::Zero
$proc = ''
while ($true) {
  $h = [Fg]::GetForegroundWindow()
  if ($h -ne $lastHwnd) {
    $procId = 0
    [void][Fg]::GetWindowThreadProcessId($h, [ref]$procId)
    $proc = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
    $lastHwnd = $h
  }
  $sb = New-Object System.Text.StringBuilder 512
  [void][Fg]::GetWindowText($h, $sb, 512)
  $r = New-Object Fg+R
  [void][Fg]::GetWindowRect($h, [ref]$r)
  $line = "$h`t$proc`t$($r.L),$($r.T),$($r.Rt),$($r.B)`t$($sb.ToString())"
  if ($line -ne $last) {
    [Console]::Out.WriteLine($line)
    [Console]::Out.Flush()
    $last = $line
  }
  Start-Sleep -Milliseconds 500
}
