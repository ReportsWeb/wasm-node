$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    docker compose up -d --build --wait --wait-timeout 180
    if ($LASTEXITCODE -ne 0) { throw 'Startup failed. Read the Docker error above; do not open the URL yet.' }
    $port = if ($env:SAMPLE_PORT) { $env:SAMPLE_PORT } else { '19222' }
    Write-Host "Ready: http://127.0.0.1:$port/"
} finally { Pop-Location }
