$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'scripts/preview.mjs') --stop
exit $LASTEXITCODE
