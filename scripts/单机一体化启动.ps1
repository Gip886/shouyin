# ============================================================
#  收银台 · 一键启动(PowerShell 版,推荐 Win10/11 用)
#
#  比 .bat 版好在哪:
#    1) 用 TCP 探活等后端真正起来了再开 Chrome(不是 sleep 4 秒赌)
#    2) node 起不来会明确报错,而不是弹个空白 Chrome
#
#  用法:
#    右键 → 用 PowerShell 运行
#    如果提示"无法加载此脚本",先跑一次:
#      Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#
#  开机自启:
#    Win+R → shell:startup → 把本脚本的快捷方式拖进去
# ============================================================

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $Root

$Port      = 3001
$PosDist   = Join-Path $Root 'apps\pos\dist'
$AdminDist = Join-Path $Root 'apps\admin\dist'
$ApiMain   = Join-Path $Root 'apps\api\dist\src\main.js'

if (-not (Test-Path $ApiMain))  { throw "找不到后端: $ApiMain,请先 pnpm build" }
if (-not (Test-Path (Join-Path $PosDist 'index.html')))   { throw "找不到 POS 前端: $PosDist,请先 pnpm --filter @shouyin/pos build" }
if (-not (Test-Path (Join-Path $AdminDist 'index.html'))) { Write-Warning "找不到 admin 前端: $AdminDist,/admin 路径会 404(pnpm --filter @shouyin/admin build 可修)" }

# 1) 启动后端(独立窗口,员工可看可关)
$env:POS_DIST   = $PosDist
$env:ADMIN_DIST = $AdminDist
$env:PORT       = $Port
Start-Process -FilePath 'node' -ArgumentList $ApiMain `
  -WindowStyle Minimized -WorkingDirectory $Root

# 2) 等端口起来(最多 30 秒)
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$Port/api/ping" -TimeoutSec 1 -UseBasicParsing
        if ($r.StatusCode -eq 200) { break }
    } catch { Start-Sleep -Milliseconds 500 }
}

# 3) 开 Chrome 全屏 app 模式
$Chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $Chrome) { throw '没检测到 Chrome,先装 Chrome(Win7 装 109 版,Win10+ 随意)' }

$Profile = Join-Path $env:LOCALAPPDATA 'ShouyinPOSChrome'
& $Chrome `
    "--app=http://localhost:$Port/pos/" `
    '--start-fullscreen' `
    '--no-first-run' `
    '--no-default-browser-check' `
    '--disable-features=TranslateUI' `
    "--user-data-dir=$Profile"
