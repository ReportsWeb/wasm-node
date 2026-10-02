$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    docker compose down --volumes
    if ($LASTEXITCODE -ne 0) { throw 'Docker stop failed.' }
} finally { Pop-Location }
