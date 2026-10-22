@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 메이플 타이머

rem 전용 브라우저 창: 화면 공유 때 'MapleStory' 창을 자동으로 고른다 (설정은 이 전용 창에 따로 저장됨)
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

rem 이미 켜져 있으면 창만 연다
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 goto open

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

echo 메이플 타이머 서버를 켜는 중...
start "메이플 타이머 서버 (이 창을 닫으면 꺼져요)" /min cmd /k npm run dev

set /a tries=0
:wait
timeout /t 1 /nobreak >nul
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 goto open
set /a tries+=1
if %tries% lss 40 goto wait
echo [!] 서버가 켜지지 않았어요. 작업 표시줄의 '메이플 타이머 서버' 창을 확인해 주세요.
pause
exit /b 1

:open
if defined BROWSER (
  start "" "%BROWSER%" --user-data-dir="%LOCALAPPDATA%\MapleTimerBrowser" --auto-select-desktop-capture-source=MapleStory --no-first-run --no-default-browser-check --app=http://localhost:5173/
) else (
  start "" http://localhost:5173/
)
exit /b 0
