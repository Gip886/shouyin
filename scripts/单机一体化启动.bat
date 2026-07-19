@echo off
REM ============================================================
REM  收银台 + 管理后台 · 一键启动(Win7 / Win10 / Win11)
REM
REM  一台电脑同时跑:
REM    - 后端 API      → http://localhost:3001/api
REM    - 收银台前端    → http://localhost:3001/pos/     (默认自动全屏打开这个)
REM    - 管理后台前端  → http://localhost:3001/admin/   (老板另外开个浏览器手输访问)
REM
REM  用法:
REM    1) 把整个"收银\"文件夹放到 D:\shouyin\ 或桌面
REM    2) 双击本文件
REM    3) 自动开黑窗口跑后端,3~5 秒后弹出 Chrome 全屏收银界面
REM
REM  开机自启:
REM    Win+R 输入 shell:startup 回车,把本文件的快捷方式拖进去
REM
REM  停止:
REM    关掉那个黑色的"收银服务"窗口就行(会问是不是终止 Node)
REM ============================================================

setlocal
REM 脚本在 scripts\ 下,回到仓库根
cd /d "%~dp0.."

REM --- 1) 启动后端(它会同时托管 POS 和 admin 两个前端) --------
REM   显式传 POS_DIST / ADMIN_DIST,防止 __dirname 反推路径出问题
set "POS_DIST=%CD%\apps\pos\dist"
set "ADMIN_DIST=%CD%\apps\admin\dist"
set "PORT=3001"

REM 用 start /min 打开一个最小化的常驻窗口跑 node,方便员工看到进程存在
start "收银服务" /min cmd /c "node apps\api\dist\src\main.js"

REM --- 2) 等后端起来(简单 sleep,Win7 没有 timeout /nobreak 也行) -
ping 127.0.0.1 -n 4 >nul

REM --- 3) 开 Chrome 全屏应用模式,直接进收银台 ------------------
REM   优先 Program Files,其次 x86,最后走 PATH
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME set "CHROME=chrome.exe"

REM 用独立 profile 目录,避免收银机 Chrome 平时被员工点进去改坏了
set "PROFILE=%LOCALAPPDATA%\ShouyinPOSChrome"

"%CHROME%" ^
  --app=http://localhost:3001/pos/ ^
  --start-fullscreen ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-features=TranslateUI ^
  --user-data-dir="%PROFILE%"

endlocal
