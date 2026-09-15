@echo off
chcp 65001 >nul
title 诛仙 · 江湖录 - 本地服务器

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   没有找到 Node.js。
  echo   请先去 https://nodejs.org 装一个 LTS 版本，然后再双击本文件。
  echo.
  pause
  exit /b 1
)

node tools\serve.mjs %1

pause
