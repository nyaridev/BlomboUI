param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [Parameter(Mandatory = $true)]
    [string]$OutFile
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$barWidth = 30
$script:lastPercent = -1

function Write-ProgressBar([int]$Percent, [long]$Received, [long]$Total) {
    if ($Total -gt 0) {
        if ($Percent -eq $script:lastPercent) {
            return
        }
        $script:lastPercent = $Percent

        $filled = [Math]::Min($barWidth, [int]($barWidth * $Percent / 100))
        if ($Percent -ge 100) {
            $bar = "=" * $barWidth
        } elseif ($filled -le 0) {
            $bar = "-" * $barWidth
        } else {
            $bar = ("=" * ($filled - 1)) + ">" + ("-" * ($barWidth - $filled))
        }

        $receivedMb = $Received / 1MB
        Write-Host -NoNewline ("`r  [{0}] {1,3}%  {2:N1} MB" -f $bar, $Percent, $receivedMb)
        return
    }

    $receivedMb = $Received / 1MB
    Write-Host -NoNewline ("`r  [{0}]  {1:N1} MB" -f ("-" * $barWidth), $receivedMb)
}

$webClient = New-Object System.Net.WebClient
$webClient.add_DownloadProgressChanged({
    param($sender, $eventArgs)
    Write-ProgressBar $eventArgs.ProgressPercentage $eventArgs.BytesReceived $eventArgs.TotalBytesToReceive
})

try {
    $webClient.DownloadFile($Url, $OutFile)
    Write-ProgressBar 100 (Get-Item $OutFile).Length (Get-Item $OutFile).Length
    Write-Host
} catch {
    Write-Host
    throw
} finally {
    $webClient.Dispose()
}
