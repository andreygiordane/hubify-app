@echo off
rem Duplo clique: desliga o Hubify que esta rodando no Docker (os dados sao mantidos).
title Hubify - Desligar (Docker)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-docker.ps1" -Parar
echo.
pause
