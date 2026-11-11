@echo off
rem Duplo clique: sobe o Hubify com Docker nesta maquina e mostra o endereco para conectar.
rem Pede permissao de administrador para liberar a porta no firewall.
title Hubify - Servidor (Docker)
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-docker.ps1" %*
echo.
pause
