@echo off
setlocal
cd /d "%~dp0"
echo ========================================
echo Polza Agent Studio - Windows build
echo ========================================
where node >nul 2>&1 || (echo ERROR: Node.js not found.& exit /b 1)
where npm >nul 2>&1 || (echo ERROR: npm not found.& exit /b 1)
where cargo >nul 2>&1 || (echo ERROR: Cargo not found. Install Rust with rustup.& exit /b 1)
where rustc >nul 2>&1 || (echo ERROR: rustc not found. Restart the terminal after installing Rust.& exit /b 1)
echo.
echo Node: & node --version
echo npm:  & npm --version
echo Rust: & rustc --version
echo Cargo:& cargo --version
echo.
echo [1/4] Installing JavaScript dependencies...
call npm install
if errorlevel 1 exit /b %errorlevel%
echo [2/4] Building frontend...
call npm run build
if errorlevel 1 exit /b %errorlevel%
echo [3/4] Building Rust/Tauri binary...
call cargo build --release --manifest-path src-tauri\Cargo.toml
if errorlevel 1 exit /b %errorlevel%
if not exist "src-tauri\target\release\polza-agent-studio.exe" (
  echo ERROR: Rust build finished but the expected EXE was not created.
  exit /b 1
)
echo [4/4] Creating Windows installer...
call npm run tauri build
if errorlevel 1 exit /b %errorlevel%
echo.
echo ========================================
echo BUILD OK
echo Installer: src-tauri\target\release\bundle\nsis\
echo ========================================
exit /b 0
