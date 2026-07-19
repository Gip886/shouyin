@echo off
REM ============================================================
REM  收银台 · 收银机端一键启动(只是打开 Chrome,不跑后端)
REM
REM  这台机器只负责打开一个全屏 Chrome,连到内网的服务器。
REM  服务器地址在下面 SERVER_URL 里,首次装机时改一次就行。
REM
REM  开机自启:Win+R → shell:startup → 把本文件快捷方式拖进去
REM
REM  员工不小心关了 Chrome?双击本文件重来。
REM ============================================================

setlocal

REM ============================================================
REM 【 装机时改这里 】把 192.168.x.x 换成服务器真实 IP
REM ============================================================
set "SERVER_URL=http://192.168.1.100:3001/pos/"

REM Chrome 位置(优先 Program Files,其次 x86,最后 PATH)
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME set "CHROME=chrome.exe"

REM 独立 profile 目录,避免收银机 Chrome 平时被员工点进去改坏了
set "PROFILE=%LOCALAPPDATA%\ShouyinPOSChrome"

"%CHROME%" ^
  --app=%SERVER_URL% ^
  --start-fullscreen ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-features=TranslateUI ^
  --user-data-dir="%PROFILE%"

endlocal
