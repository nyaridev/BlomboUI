param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$OutFile
)

$ErrorActionPreference = 'Stop'
try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
} catch { }
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor 3072
} catch {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

$esc = [char]27
$fill = [char]0x2588
$charset = @(
    [char]0x0020,
    [char]0x258F, [char]0x258E, [char]0x258D, [char]0x258C,
    [char]0x258B, [char]0x258A, [char]0x2589, $fill
)
$barWidth = 32
$ok = $esc + '[38;5;114m'
$muted = $esc + '[38;5;245m'
$reset = $esc + '[0m'

function Format-Bytes([long]$n) {
    if ($n -lt 1024) { return ('{0} B' -f $n) }
    if ($n -lt 1MB) { return ('{0:N1} KB' -f ($n / 1KB)) }
    if ($n -lt 1GB) { return ('{0:N1} MB' -f ($n / 1MB)) }
    return ('{0:N2} GB' -f ($n / 1GB))
}

function Get-Bar([double]$ratio) {
    if ($ratio -lt 0) { $ratio = 0 }
    if ($ratio -gt 1) { $ratio = 1 }
    $frac = $ratio * $barWidth
    $nFull = [int][Math]::Floor($frac)
    $nsyms = $charset.Length - 1
    $phase = [int][Math]::Floor(($frac - $nFull) * $nsyms)
    if ($phase -ge $nsyms) { $phase = $nsyms - 1 }
    $bar = $fill.ToString() * $nFull
    $remain = $barWidth - $nFull
    if ($remain -gt 0) {
        $bar += $charset[$phase]
        $remain -= 1
        $bar += ' ' * $remain
    }
    return $bar
}

function Get-IndeterminateBar([double]$seconds) {
    $span = 6
    $pos = [int](($seconds * 12) % [Math]::Max(1, $barWidth - $span + 1))
    return (' ' * $pos) + ($fill.ToString() * $span) + (' ' * ($barWidth - $pos - $span))
}

function Write-BarLine([string]$line) {
    [Console]::Write([char]13 + $line + $esc + '[K')
}

function Show-Bar([long]$got, [long]$total, [TimeSpan]$elapsed, [bool]$done) {
    $speed = ''
    $secs = $elapsed.TotalSeconds
    if ($secs -gt 0.05 -and $got -gt 0) {
        $speed = '  ' + (Format-Bytes ([long]($got / $secs))) + '/s'
    }
    if ($total -gt 0) {
        $ratio = $got / [double]$total
        if ($done) { $ratio = 1 }
        $pct = [int][Math]::Floor($ratio * 100)
        $sizes = '{0} / {1}' -f (Format-Bytes $got), (Format-Bytes $total)
        $bar = Get-Bar $ratio
        $line = ('    {0}{1,3}%{2}|{3}{4}{2}| {0}{5}{6}{2}' -f $muted, $pct, $reset, $ok, $bar, $sizes, $speed)
    } else {
        $bar = if ($done) { Get-Bar 1 } else { Get-IndeterminateBar $secs }
        $line = ('    {0}  --{2}|{3}{4}{2}| {0}{5}{6}{2}' -f $muted, 0, $reset, $ok, $bar, (Format-Bytes $got), $speed)
    }
    Write-BarLine $line
}

function Save-Url([string]$TargetUrl, [string]$Dest, [bool]$insecure) {
    if ($insecure) {
        [Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    }

    $req = [Net.WebRequest]::Create($TargetUrl)
    $req.Method = 'GET'
    $req.AllowAutoRedirect = $true
    $req.Timeout = 120000
    $req.UserAgent = 'BlomboUI'
    if ($req -is [Net.HttpWebRequest]) {
        $req.ReadWriteTimeout = 120000
        $req.AutomaticDecompression = [Net.DecompressionMethods]::GZip -bor [Net.DecompressionMethods]::Deflate
    }

    $resp = $null
    $src = $null
    $output = $null
    $cursor = $true
    try {
        try { $cursor = [Console]::CursorVisible; [Console]::CursorVisible = $false } catch { }
        $resp = $req.GetResponse()
        $total = $resp.ContentLength
        $src = $resp.GetResponseStream()
        $output = [IO.File]::Create($Dest)
        $buf = New-Object byte[] 65536
        $got = [long]0
        $sw = [Diagnostics.Stopwatch]::StartNew()
        $lastDraw = [long]0
        Show-Bar 0 $total $sw.Elapsed $false
        while (($n = $src.Read($buf, 0, $buf.Length)) -gt 0) {
            $output.Write($buf, 0, $n)
            $got += $n
            $now = $sw.ElapsedMilliseconds
            if (($now - $lastDraw) -ge 80) {
                $lastDraw = $now
                Show-Bar $got $total $sw.Elapsed $false
            }
        }
        Show-Bar $got $total $sw.Elapsed $true
        [Console]::WriteLine()
    } finally {
        if ($output) { $output.Close() }
        if ($src) { $src.Close() }
        if ($resp) { $resp.Close() }
        try { [Console]::CursorVisible = $cursor } catch { }
    }
}

$delay = 2
for ($i = 0; $i -lt 5; $i++) {
    $insecure = ($i -ge 3)
    try {
        if (Test-Path -LiteralPath $OutFile) {
            Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
        }
        Save-Url $Url $OutFile $insecure
        if ((Test-Path -LiteralPath $OutFile) -and ((Get-Item -LiteralPath $OutFile).Length -gt 0)) {
            exit 0
        }
    } catch {
        if (Test-Path -LiteralPath $OutFile) {
            Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
        }
        if ($i -lt 4) { Start-Sleep -Seconds $delay }
    }
}

exit 1
