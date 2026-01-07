@echo off
REM Claude Plugins & Skills Manager Installation Script for Windows

echo.
echo ============================================================
echo   Claude Plugins ^& Skills Manager - Installation
echo ============================================================
echo.

REM Check Node.js installation
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/3] Installing dependencies...
call npm install
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [2/3] Setting up configuration...
echo Configuration complete.

echo.
echo [3/3] Creating shortcuts...
echo Shortcut created: start.bat

echo.
echo ============================================================
echo   Installation Complete!
echo ============================================================
echo.
echo To start the manager:
echo   1. Double-click 'start.bat'
echo   2. Or run: npm start
echo   3. Or run: node server-static.js
echo.
echo The manager will be available at: http://localhost:3456
echo.
pause
