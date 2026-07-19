@echo off
REM ============================================================
REM  收银系统 · 服务端一键启动(装在本地服务器上,不装在收银机)
REM
REM  这台机器一开就跑三件事:
REM    - 后端 API       http://<本机IP>:3001/api
REM    - 收银台前端     http://<本机IP>:3001/pos/
REM    - 管理后台前端   http://<本机IP>:3001/admin/
REM
REM  收银机和老板电脑不装任何东西,浏览器输上面 URL 就用。
REM
REM  用法:
REM    1) 把整个"收银\"文件夹放到 D:\shouyin\
REM    2) 双击本文件(建议服务器留一个窗口跑,不要关)
REM    3) 开机自启:Win+R → shell:startup → 把本文件快捷方式拖进去
REM
REM  查本机 IP:cmd 里 ipconfig 找到"IPv4 地址",一般是 192.168.x.x
REM ============================================================

setlocal
REM 脚本在 scripts\ 下,回到仓库根
cd /d "%~dp0.."

REM 显式告诉后端两个前端 dist 在哪(防止 __dirname 反推路径出问题)
set "POS_DIST=%CD%\apps\pos\dist"
set "ADMIN_DIST=%CD%\apps\admin\dist"
set "PORT=3001"

REM 前台跑,便于查日志、崩了看到。要后台化就 start /min 或用 nssm 装成服务。
node apps\api\dist\src\main.js

endlocal
