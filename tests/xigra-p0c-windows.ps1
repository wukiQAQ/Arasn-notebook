param([ValidateSet(78, 125)][byte]$Hotkey = 78)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class XigraTestKeys {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr window);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, IntPtr processId);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint thread, uint other, bool attach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
    [StructLayout(LayoutKind.Sequential)] struct KeyboardInput {
        public ushort Vk, Scan; public uint Flags, Time; public UIntPtr Extra;
    }
    [StructLayout(LayoutKind.Sequential)] struct MouseInput {
        public int X, Y; public uint Data, Flags, Time; public UIntPtr Extra;
    }
    [StructLayout(LayoutKind.Explicit)] struct InputData {
        [FieldOffset(0)] public KeyboardInput Key;
        [FieldOffset(0)] public MouseInput Mouse;
    }
    [StructLayout(LayoutKind.Sequential)] struct Input {
        public uint Type; public InputData Data;
    }
    [DllImport("user32.dll")] static extern uint SendInput(uint count, Input[] inputs, int size);
    public static void Chord(ushort key) {
        ushort[] keys = { 0x11, 0x12, key, key, 0x12, 0x11 };
        Input[] inputs = new Input[keys.Length];
        for (int i = 0; i < inputs.Length; i++) {
            inputs[i].Type = 1;
            inputs[i].Data.Key = new KeyboardInput { Vk = keys[i], Flags = i < 3 ? 0u : 2u };
        }
        if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input))) != inputs.Length)
            throw new InvalidOperationException("Windows rejected the test chord");
    }
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    public static IntPtr WindowAt(int x, int y) { return GetAncestor(WindowFromPoint(new Point { X = x, Y = y }), 2); }
    public static Rect Bounds(IntPtr hwnd) { Rect rect; GetWindowRect(hwnd, out rect); return rect; }
    public static uint WindowProcess(IntPtr window) {
        uint id;
        GetWindowThreadProcessId(window, out id);
        return id;
    }
    public static void FocusTestSource(IntPtr source) {
        if (SetForegroundWindow(source)) return;
        uint current = GetCurrentThreadId();
        uint foreground = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
        if (foreground == 0 || current == foreground || !AttachThreadInput(current, foreground, true)) return;
        try { BringWindowToTop(source); SetForegroundWindow(source); }
        finally { AttachThreadInput(current, foreground, false); }
    }
}
'@

function Send-TestKey([byte]$Key, [bool]$Released = $false) {
    [XigraTestKeys]::keybd_event($Key, 0, $(if ($Released) { 2 } else { 0 }), [UIntPtr]::Zero)
}

[void][XigraTestKeys]::SetProcessDPIAware()
$form = New-Object System.Windows.Forms.Form
$form.Text = 'XIGRA shortcut test source'
$form.StartPosition = 'Manual'
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = [Drawing.Point]::new($area.Left + [int]($area.Width / 4), $area.Top + [int]($area.Height / 4))
$form.ClientSize = [Drawing.Size]::new(256, 128)
$mouseStart = [System.Windows.Forms.Cursor]::Position
$mouseTestPoint = $null
$script:mouseDown = 0
$script:mouseUp = 0
$form.add_MouseDown({ $script:mouseDown++ })
$form.add_MouseUp({ $script:mouseUp++ })
$form.Show()
[System.Windows.Forms.Application]::DoEvents()
[Console]::WriteLine($form.Handle.ToInt64())
try {
    :commands while ($null -ne ($line = [Console]::ReadLine())) {
        [System.Windows.Forms.Application]::DoEvents()
        $command, $window = $line.Split(' ', 2)
        $expected = [IntPtr]::new([long]$window)
        if ($command -eq 'activate') {
            if ($expected -ne $form.Handle) { throw 'Can only activate the dedicated test window' }
            [XigraTestKeys]::FocusTestSource($form.Handle)
        }
        $foreground = [XigraTestKeys]::GetForegroundWindow()
        if ($foreground -ne $expected) {
            $owner = Get-Process -Id ([XigraTestKeys]::WindowProcess($foreground)) -ErrorAction SilentlyContinue
            [Console]::WriteLine("foreground=$($foreground.ToInt64()) ($($owner.ProcessName)) expected=$window")
            continue
        }
        $sent = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        switch ($command) {
            { $_ -match '^f(1[4-9]|2[0-4])$' } { [XigraTestKeys]::Chord([uint16](111 + [int]$command.Substring(1))) }
            { $_ -in 'hotkey', 'repeat-hotkey' } {
                Send-TestKey 0x11
                Send-TestKey 0x12
                Send-TestKey $Hotkey
                if ($command -eq 'repeat-hotkey') {
                    foreach ($repeat in 1..8) {
                        Start-Sleep -Milliseconds 80
                        Send-TestKey $Hotkey
                    }
                }
                Send-TestKey $Hotkey $true
                Send-TestKey 0x12 $true
                Send-TestKey 0x11 $true
            }
            'pinyin' {
                foreach ($key in @(0x4E, 0x49, 0x48, 0x41, 0x4F)) {
                    Send-TestKey $key
                    Send-TestKey $key $true
                }
            }
            'shift' { Send-TestKey 0x10; Send-TestKey 0x10 $true }
            'escape' { Send-TestKey 0x1B; Send-TestKey 0x1B $true }
            'space' { Send-TestKey 0x20; Send-TestKey 0x20 $true }
            { $_ -in 'middle', 'ctrl-middle', 'double-middle', 'mouse4', 'mouse5', 'ctrl-right-drag' } {
                if ($expected -ne $form.Handle) { throw 'Can only click the dedicated test window' }
                $point = $form.Location
                [void][XigraTestKeys]::SetWindowPos($form.Handle, [IntPtr]::new(-1), $point.X, $point.Y, 256, 172, 0x40)
                [System.Windows.Forms.Application]::DoEvents()
                $bounds = [XigraTestKeys]::Bounds($form.Handle)
                $mouseTestPoint = [Drawing.Point]::new([int](($bounds.Left + $bounds.Right) / 2), [int](($bounds.Top + $bounds.Bottom) / 2))
                $owner = [XigraTestKeys]::WindowAt($mouseTestPoint.X, $mouseTestPoint.Y)
                if ($owner -ne $form.Handle) {
                    $ownerProcess = Get-Process -Id ([XigraTestKeys]::WindowProcess($owner)) -ErrorAction SilentlyContinue
                    throw "Mouse test point $mouseTestPoint belongs to $owner ($($ownerProcess.ProcessName)), expected $($form.Handle)"
                }
                [System.Windows.Forms.Cursor]::Position = $mouseTestPoint
                $side = if ($command -eq 'mouse4') { 1 } elseif ($command -eq 'mouse5') { 2 } else { 0 }
                $drag = $command -eq 'ctrl-right-drag'
                $control = $drag -or $command -eq 'ctrl-middle'
                $down = if ($drag) { 0x8 } elseif ($side) { 0x80 } else { 0x20 }
                $up = if ($drag) { 0x10 } elseif ($side) { 0x100 } else { 0x40 }
                try {
                    if ($control) { Send-TestKey 0x11; Start-Sleep -Milliseconds 35 }
                    $clicks = if ($command -eq 'double-middle') { 2 } else { 1 }
                    for ($i = 0; $i -lt $clicks; $i++) {
                        if ([XigraTestKeys]::GetForegroundWindow() -ne $form.Handle) { throw 'Lost foreground before test click' }
                        [XigraTestKeys]::mouse_event($down, 0, 0, $side, [UIntPtr]::Zero)
                        Start-Sleep -Milliseconds 40
                        if ($drag) {
                            for ($j = 0; $j -lt 10; $j++) {
                                [XigraTestKeys]::mouse_event(1, 4, 0, 0, [UIntPtr]::Zero)
                                Start-Sleep -Milliseconds 14
                            }
                            for ($j = 0; $j -lt 10; $j++) {
                                [XigraTestKeys]::mouse_event(1, 0, 4, 0, [UIntPtr]::Zero)
                                Start-Sleep -Milliseconds 14
                            }
                            $mouseTestPoint = [System.Windows.Forms.Cursor]::Position
                        }
                        [XigraTestKeys]::mouse_event($up, 0, 0, $side, [UIntPtr]::Zero)
                        [System.Windows.Forms.Application]::DoEvents()
                    }
                    Start-Sleep -Milliseconds 45
                } finally {
                    if ($control) { Send-TestKey 0x11 $true }
                }
            }
            'mouse-counts' {
                [Console]::WriteLine("$script:mouseDown,$script:mouseUp")
                continue commands
            }
            { $_ -in 'edge-top', 'edge-leave', 'fullscreen-on', 'fullscreen-off' } {
                if ($expected -ne $form.Handle) { throw 'Requires the dedicated test window' }
                $display = [System.Windows.Forms.Screen]::PrimaryScreen
                if ($command -eq 'fullscreen-on') {
                    $box = $display.Bounds
                    [void][XigraTestKeys]::SetWindowPos($form.Handle, [IntPtr]::new(-1), $box.Left, $box.Top, $box.Width, $box.Height, 0x40)
                } elseif ($command -eq 'fullscreen-off') {
                    [void][XigraTestKeys]::SetWindowPos($form.Handle, [IntPtr]::new(-1), ($area.Left + [int]($area.Width / 4)), ($area.Top + [int]($area.Height / 4)), 256, 172, 0x40)
                } else {
                    $box = $display.WorkingArea
                    $virtual = [System.Windows.Forms.SystemInformation]::VirtualScreen
                    $x = $box.Left + [int]($box.Width / 2)
                    $y = $box.Top + $(if ($command -eq 'edge-top') { 3 } else { [int]($box.Height / 2) })
                    $absoluteX = [uint32]([Math]::Round((($x - $virtual.Left) * 65535) / ($virtual.Width - 1)))
                    $absoluteY = [uint32]([Math]::Round((($y - $virtual.Top) * 65535) / ($virtual.Height - 1)))
                    [XigraTestKeys]::mouse_event(0xc001, $absoluteX, $absoluteY, 0, [UIntPtr]::Zero)
                    Start-Sleep -Milliseconds 20
                    $mouseTestPoint = [System.Windows.Forms.Cursor]::Position
                }
            }
            'activate' {}
            'foreground-status' {}
            default { throw 'Unknown key test command' }
        }
        [Console]::WriteLine($sent)
    }
} finally {
    if ($null -ne $mouseTestPoint -and [System.Windows.Forms.Cursor]::Position -eq $mouseTestPoint) {
        [System.Windows.Forms.Cursor]::Position = $mouseStart
    }
    $form.Dispose()
}
