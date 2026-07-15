# 移动端(mobile)· 打包与部署

Web H5 版跑得起来 = `pnpm --filter @shouyin/mobile dev`。这里主要讲**怎么打成 Android APK**,给员工手机用。

装 APK 之后员工的完整流程:

1. 打开 APK → 跳"连接服务器"页
2. 扫管理员在 admin 后台"移动端配置"页出示的 QR
3. QR 里是店内后端地址(比如 `http://192.168.1.42:3001`)
4. 校验通过 → 跳登录页 → 用店员账号登录
5. 之后扫码入库/盘点/报损/看临期,离线也能干,联网自动上传

## 打 APK,三种姿势

### 姿势 1 · GitHub Actions 云端打(**推荐,不用装任何东西**)

本地什么都不用装。把仓库推到 GitHub,workflow 在云端跑 Ubuntu runner + JDK 21 + Android SDK,产出 APK 挂在 Actions Artifacts 或 Release 里。

**首次:**

```bash
# 项目根目录
git add . && git commit -m "wip"
# GitHub 建个空仓库,复制 SSH/HTTPS 地址
git remote add origin git@github.com:你的用户名/shouyin.git
git push -u origin master
```

**触发打包**,任选一种:

- **推 master 分支** 自动跑(改了 `apps/mobile/**` 等文件时触发)
- **手动跑一次**:GitHub 仓库页 → `Actions` → 左边 `Build Android APK` → 右上 `Run workflow` 按钮 → 绿色 `Run`
- **发版**:`git tag v0.2.0 && git push origin v0.2.0` → 打完自动挂到 Release 页

**拿 APK:**

| 触发方式 | 下载位置 | 保留时长 |
|---|---|---|
| 推 master / 手动跑 | Actions → 那次 Run 底部 `Artifacts` | 90 天 |
| 打 tag `v*` | 仓库首页 → `Releases` → 对应 tag | 永久 |

**耗时:**

- 首次:8~12 分钟(装依赖 + 首次 Gradle 下 Android SDK 组件)
- 之后:4~6 分钟(pnpm 缓存命中)

**成本:**

- 公开仓库:无限免费
- 私有仓库:每月 2000 分钟免费

workflow 文件在 `.github/workflows/build-apk.yml`,不用改。

### 姿势 2 · 本机 Android Studio(要装环境)

只在你想真机 debug、要看 logcat 时才推荐。

**一次性装环境:**

- [Android Studio](https://developer.android.com/studio)(自带 SDK 管理器)
- 打开 Android Studio,让它下 API 34 或 35
- JDK 21(Capacitor 7 要求;Android Studio 通常自带一个够新的)
- 环境变量:

  macOS/Linux:
  ```bash
  export ANDROID_HOME=$HOME/Library/Android/sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools
  ```

  Windows:
  ```powershell
  setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
  ```

**首次生成 Android 工程:**

```bash
cd apps/mobile
pnpm i
pnpm run build
pnpm run cap:add-android
```

产出 `apps/mobile/android/` 目录。

**每次改前端代码后:**

```bash
pnpm --filter @shouyin/mobile run cap:sync
```

**打包:**

```bash
pnpm --filter @shouyin/mobile run cap:open  # 打开 Android Studio
# 菜单 Build → Build Bundle(s)/APK(s) → Build APK(s)
```

或命令行:

```bash
cd apps/mobile/android
./gradlew assembleDebug          # macOS/Linux
# gradlew.bat assembleDebug      # Windows
```

产物:

```
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### 姿势 3 · 手机浏览器直接开(**不打包,调试快**)

只在开发调试用,员工机不能这么搞。

```bash
pnpm --filter @shouyin/mobile dev
```

Vite 输出 `Network:  http://192.168.x.x:5175`,手机浏览器打开这个。

**注意:HTTP 非 localhost 页面无法用摄像头**(`getUserMedia` 只在 https/localhost 下可用)。要在手机浏览器里也能扫码,选一个:

- **A. Chrome 加白名单**:手机 Chrome 地址栏输 `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,把 `http://192.168.x.x:5175` 加进去 → 重启
- **B. 让 Vite 走 HTTPS**:装 `@vitejs/plugin-basic-ssl`,vite.config 里 `plugins: [react(), basicSsl()]` + `server.https: true`,访问 `https://192.168.x.x:5175` 时手机会警告"证书不安全",点继续
- **C. 就是打 APK**(Capacitor origin 是 `http://localhost`,浏览器视为安全上下文,摄像头直接放行)

## 装到手机

**普通方式:**

- 手机 → 设置 → 应用 → **允许未知来源** / **允许该来源应用安装**
- 把 APK 拖到微信/邮件/AirDrop 发到手机 → 点开安装

**开发者调试:**

- 手机开发者选项打开、USB 调试打开、连线
- `adb install app-debug.apk`
- `adb logcat | grep Capacitor` 看运行日志

## 后端配置

打好 APK 装到手机后,要保证员工手机能连上服务器,这需要:

1. **同一 Wi-Fi 网络** —— 服务器 PC 和员工手机连的是同一个路由器/AP
2. **NestJS 监听 0.0.0.0** —— Phase 2 已经改成显式监听,不用管
3. **防火墙放行 TCP 3001** —— Windows 上右下角 `Windows Defender 防火墙` → `高级安全` → `入站规则` → 新建端口规则 → 允许 3001,**仅"专用网络"**(别放公网)
4. **CORS 白名单** —— 已经允许 `http://localhost`(Capacitor Android origin)和 192.168/10/172.16-31 内网段,不用管

自查:PC 上跑

```bash
curl http://localhost:3001/api/ping
```

在员工手机浏览器打开 `http://<PC 局域网 IP>:3001/api/ping`,应该看到:

```json
{"ok":true,"name":"收银 API","version":"1","time":...}
```

看到就说明手机能连通后端,APK 里 QR 一扫就能用。

## 首次给员工做部署

1. 老板/管理员在店里 PC 上打开 admin 后台(端口 5173),侧栏 `移动端配置`
2. 页面自动猜一个 URL(拿 admin 页面的 hostname + `:3001`),点 `测试连接`
3. 通过后出 QR → 让员工用 APK 扫
4. 之后员工装完 APK 首次打开就跳 QR 页,直接扫,一次到位

**换店/换服务器时**:APK 里 `连接服务器`(setup 页有 `重新配置` 按钮) → 扫新 QR。

## 常见问题

**Q. APK 打开显示"连接失败"**
- 手机断了 Wi-Fi;或连了错的 Wi-Fi(比如手机热点自动切了 4G)
- PC 关机、后端没起、端口不对
- Windows 防火墙没放行 3001

**Q. 员工手机扫不出 QR**
- QR 太小,让管理员浏览器窗口放大或用手机对着屏幕近一点
- 用 setup 页的 `手动输入` 兜底,直接填 URL

**Q. 扫商品条码时提示"不支持"**
- 少数没 Google Play Services 的国产 ROM 上 Google Code Scanner 拉不起来,会自动回落到本地 ML Kit 模式(要求相机权限)。第一次会弹权限请求,允许即可
- 极冷门机型完全不支持 ML Kit → 走界面下方"手动输入条码"兜底

**Q. Actions 里 workflow 挂了**
- 看红色那一步的日志。90% 是 pnpm 版本、Node 版本、锁文件不一致 —— 本地跑一次 `pnpm install` 更新 `pnpm-lock.yaml` 再推
- 首次 CI 里 `pnpm exec cap add android` 会花几十秒生成原生工程,不算错

## release APK(有签名)

现在没做。debug APK 内网分发够用了。等要正式发 Play Store 或提高覆盖率再看:
https://capacitorjs.com/docs/android/deploying-to-google-play
