param(
    [Parameter(Position = 0)]
    [ValidateSet("local", "gcp", "help")]
    [string]$Mode = "help"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $Root

function Show-Usage {
    Write-Host "Kubi secret template helper"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  .\deploy\scripts\generate-secrets.ps1 <local|gcp>"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\deploy\scripts\generate-secrets.ps1 local"
    Write-Host "  .\deploy\scripts\generate-secrets.ps1 gcp"
    Write-Host ""
    Write-Host "Outputs:"
    Write-Host "  local -> deploy/k8s/secrets/local/local.env.private"
    Write-Host "  gcp   -> deploy/k8s/secrets/external/gcp/secret-manager-values.private.env"
    Write-Host ""
    Write-Host "Generated files are ignored by Git. Replace dummy values locally."
}

if ($Mode -eq "help") {
    Show-Usage
    exit 0
}

if ($Mode -eq "local") {
    $Source = "deploy/k8s/secrets/local/local.env.example"
    $Target = "deploy/k8s/secrets/local/local.env.private"
} else {
    $Source = "deploy/k8s/secrets/external/gcp/secret-manager-values.example.env"
    $Target = "deploy/k8s/secrets/external/gcp/secret-manager-values.private.env"
}

if (Test-Path $Target) {
    Write-Host "Already exists: $Target"
    exit 0
}

Copy-Item $Source $Target
Write-Host "Created $Target with dummy values."
