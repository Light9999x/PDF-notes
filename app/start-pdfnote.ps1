$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'dist/index.html'))) {
    Write-Host 'Please run npm ci and npm run build first.'
    exit 1
}
& node (Join-Path $PSScriptRoot 'scripts/preview.mjs')
exit $LASTEXITCODE
