@echo off
chcp 65001 >nul
echo.
echo ========================================
echo    Claude Plugin Manager
echo ========================================
echo.
echo 正在启动服务器...
echo.

node server-static.js

pause
