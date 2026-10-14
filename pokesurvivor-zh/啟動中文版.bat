@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PokéSurvivor 中文版（請不要關閉這個視窗）
echo PokéSurvivor 中文版啟動中…
echo 網址：http://localhost:8765/
echo 同事請用你電腦的區網 IP 連線，例如 http://192.168.x.x:8765/ （用 ipconfig 查 IPv4）
echo 關閉這個視窗就會停止伺服器。
echo.
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:8765/"
node tools\zh\serve.js 8765
pause
