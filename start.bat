@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 메이플 타이머

rem 이미 켜져 있으면 브라우저만 연다
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo 메이플 타이머가 이미 켜져 있어요. 브라우저를 엽니다.
  start "" http://localhost:5173
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js 가 설치돼 있지 않아요. https://nodejs.org 에서 설치한 뒤 다시 실행해 주세요.
  pause
  exit /b 1
)

if not exist node_modules (
  echo 처음 실행이라 필요한 파일을 설치하는 중이에요...
  call npm install
  if errorlevel 1 (
    echo [!] 설치에 실패했어요.
    pause
    exit /b 1
  )
)

echo 메이플 타이머를 켜는 중... 잠시 뒤 브라우저가 열려요. (이 창을 닫으면 꺼져요)
call npm run dev -- --open
pause
