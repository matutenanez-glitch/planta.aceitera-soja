@echo off
title Sincronizador de Versiones Aceitera de Soja - GitHub
color 0A

echo ================================================================
echo    CONTROL DE VERSIONES - SISTEMA DE PLANTA ACEITERA DE SOJA
echo ================================================================
echo.

where git >nul 2>nul
if %errorlevel% neq 0 (
color 0C
echo [ERROR] Git no esta instalado o no esta en las variables de entorno PATH.
echo Por favor instala Git desde https://git-scm.com/ e intentalo de nuevo.
echo.
pause
exit /b
)

echo [1/3] Verificando archivos modificados...
git status -s
echo.

set /p COMMIT_MSG="[2/3] Ingrese un resumen de los cambios (Presione Enter para mensaje automatico): "

if "%COMMIT_MSG%"=="" (
set COMMIT_MSG=Actualizacion SoyaCore OS - %DATE% %TIME%
)

echo.
echo [3/3] Guardando y subiendo a GitHub...
git add .
git commit -m "%COMMIT_MSG%"
git push origin main

echo.
if %errorlevel% equ 0 (
color 0A
echo ================================================================
echo   ¡ÉXITO! Todos los cambios han sido guardados en GitHub.
echo ================================================================
) else (
color 0E
echo ================================================================
echo   [AVISO] Revisa si falta configurar el repositorio remoto.
echo ================================================================
)

echo.
pause