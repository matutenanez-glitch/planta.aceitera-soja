@echo off
chcp 65001 >nul
title Sincronizador SoyaCore OS - GitHub
color 0A
setlocal

rem Ejecutar siempre desde la raíz del proyecto (este archivo vive en scripts\)
cd /d "%~dp0.."

echo ================================================================
echo    CONTROL DE VERSIONES - SOYACORE OS (PLANTA ACEITERA)
echo ================================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
    color 0C
    echo [ERROR] Git no está instalado o no está en el PATH.
    echo Instalalo desde https://git-scm.com/ y volvé a intentar.
    goto :fin
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
    color 0C
    echo [ERROR] Esta carpeta no es un repositorio de Git.
    goto :fin
)

rem Si hay Node y dependencias instaladas, recompilar los estilos antes de subir
if exist node_modules\tailwindcss (
    echo [1/4] Recompilando estilos...
    call npm run build:css
    if errorlevel 1 (
        color 0C
        echo [ERROR] Falló la compilación de estilos. No se subió nada.
        goto :fin
    )
) else (
    echo [1/4] Sin node_modules: se omite la compilación de estilos.
)
echo.

echo [2/4] Archivos modificados:
git status -s
git add -A
git diff --cached --quiet
if not errorlevel 1 (
    echo.
    echo No hay cambios para guardar.
    goto :fin
)
echo.

set "COMMIT_MSG="
set /p "COMMIT_MSG=[3/4] Resumen de los cambios (Enter = mensaje automático): "
if not defined COMMIT_MSG set "COMMIT_MSG=Actualización SoyaCore OS - %DATE% %TIME:~0,5%"

git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    color 0C
    echo [ERROR] No se pudo crear el commit.
    goto :fin
)

echo.
echo [4/4] Trayendo cambios remotos y subiendo a GitHub...
git pull --rebase origin main
if errorlevel 1 (
    color 0E
    echo [AVISO] Hay conflictos con cambios hechos en GitHub. Resolvelos y volvé a ejecutar.
    goto :fin
)
git push origin HEAD:main
if errorlevel 1 (
    color 0E
    echo ================================================================
    echo   [AVISO] No se pudo subir. Revisá la conexión o el remoto:
    echo   git remote add origin https://github.com/USUARIO/REPO.git
    echo ================================================================
    goto :fin
)

color 0A
echo ================================================================
echo   ¡ÉXITO! Los cambios quedaron guardados en GitHub.
echo ================================================================

:fin
echo.
pause
endlocal
