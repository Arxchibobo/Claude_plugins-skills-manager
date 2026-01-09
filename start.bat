@echo off
chcp 65001 >nul
echo.
echo ========================================
echo    Claude Plugin Manager
echo ========================================
echo.
echo 正在启动服务器...
echo.

:: Start server in background
start /B node server.js

:: Wait for server to start
timeout /t 2 /nobreak >nul

:: Open browser
start http://localhost:3456

echo.
echo ✓ 服务器已启动: http://localhost:3456
echo ✓ 浏览器已自动打开
echo.
echo 按任意键关闭服务器...
pause >nul

:: Kill node process on exit
taskkill /F /IM node.exe >nul 2>&1
