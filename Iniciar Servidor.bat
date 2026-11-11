@echo off
rem Duplo clique para ligar o servidor do Hubify nesta maquina.
title Hubify - Servidor
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-servidor.ps1" %*
echo.
pause
