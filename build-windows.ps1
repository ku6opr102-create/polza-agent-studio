$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host 'Polza Agent Studio - Windows release build'
Get-Command node | Out-Null
Get-Command npm | Out-Null
Get-Command cargo | Out-Null
Get-Command rustc | Out-Null
if (-not (Test-Path package-lock.json)) { throw 'package-lock.json is required for a reproducible release build.' }
npm ci
npm run typecheck
npm test
npm run build
npm run tauri -- build --target x86_64-pc-windows-msvc
$exe = 'src-tauri/target/x86_64-pc-windows-msvc/release/polza-agent-studio.exe'
if (-not (Test-Path $exe)) { $exe = 'src-tauri/target/release/polza-agent-studio.exe' }
if (-not (Test-Path $exe)) { throw 'Release executable was not created.' }
$installerDir = 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis'
if (-not (Test-Path $installerDir)) { $installerDir = 'src-tauri/target/release/bundle/nsis' }
$installer = Get-ChildItem $installerDir -Filter '*.exe' -File | Sort-Object Length -Descending | Select-Object -First 1
if (-not $installer) { throw 'NSIS installer was not created.' }
New-Item -ItemType Directory -Force release | Out-Null
Copy-Item $exe 'release/Polza-Agent-Studio-Portable.exe' -Force
Copy-Item $installer.FullName 'release/Polza-Agent-Studio-Setup.exe' -Force
Get-ChildItem release -File | ForEach-Object { '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash, $_.Name } | Set-Content release/SHA256SUMS.txt
Write-Host 'BUILD SUCCESS'
Get-ChildItem release -File | Format-Table Name, Length
