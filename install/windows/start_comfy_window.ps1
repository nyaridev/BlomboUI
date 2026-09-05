param(
    [Parameter(Mandatory = $true)][string]$Python,
    [Parameter(Mandatory = $true)][string]$ComfyDir,
    [Parameter(Mandatory = $true)][string]$ListenHost,
    [Parameter(Mandatory = $true)][string]$Port,
    [Parameter(Mandatory = $true)][string]$OutDir,
    [string]$Yaml = "",
    [string]$ModelsDir = "",
    [string]$ExtraArgs = ""
)

$arg = @(
    "-I",
    "-u",
    "main.py",
    "--listen", $ListenHost,
    "--port", $Port,
    "--disable-auto-launch",
    "--preview-method", "auto",
    "--output-directory", $OutDir
)
if ($ModelsDir) {
    $arg += @("--models-directory", $ModelsDir)
}
if ($Yaml -and (Test-Path -LiteralPath $Yaml)) {
    $arg += @("--extra-model-paths-config", $Yaml)
}
if ($ExtraArgs) {
    $arg += [regex]::Split($ExtraArgs.Trim(), '\s+') | Where-Object { $_ }
}

Start-Process -FilePath $Python -WorkingDirectory $ComfyDir -ArgumentList $arg
