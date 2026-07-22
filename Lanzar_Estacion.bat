@echo off
title VIDEOCLÚ PUTREFACTOR A TORSIÓN -- Estación de Control
cd /d "%~dp0"
echo ===============================================================================
echo      V I D E O C L Ú   P U T R E F A C T O R   A   T O R S I Ó N
echo         Estación de Control, Registro y Auditoría Criptográfica
echo ===============================================================================
echo.
echo Iniciando Servidor Python en http://127.0.0.1:5000 ...
echo Abriendo ventana independiente de la Estación de Control...
echo.
start "" /b python server.py
timeout /t 2 /nobreak >nul
start msedge --app=http://127.0.0.1:5000 || start chrome --app=http://127.0.0.1:5000 || start http://127.0.0.1:5000
echo.
echo Presiona cualquier tecla para cerrar esta ventana de inicio...
pause >nul
