# 收银系统 · C/S 部署手册(服务器 + 客户端)

**架构一句话**:一台"本地服务器"跑后端 + 数据库 + 前端静态资源,收银机/老板电脑/仓管手机全都是浏览器/APK 客户端,通过内网 IP 访问。

跟"全部堆一台老 Win7"相比,这套的好处:

- 收银机死了不影响开单(挪个平板/笔记本继续用) —— 数据不在收银机
- 老 Win7 顺不动 PostgreSQL,新服务器扛得住
- 老板在办公室看后台不用挤到收银台前
- 手机 APK、二号收银机、外卖单打印,都是同一台服务器,数据天然一致

如果你没有多余的机器,想全塞一台老 Win7 —— 参考老的"单机一体化"脚本 `scripts/单机一体化启动.bat`,一台干三件事,方案也能跑,只是不推荐。

---

## 拓扑

```
                   ┌──────────────────────────┐
                   │   本地服务器(推荐 Win10/11 或 Ubuntu)  │
                   │  ┌────────────────────┐   │
                   │  │  node · port 3001  │   │
   店里 Wi-Fi ─────┼──┤  ├─ /api/*         │   │
     (192.168.x/24)│  │  ├─ /pos/*         │   │
                   │  │  └─ /admin/*       │   │
                   │  └────────────────────┘   │
                   │  ┌────────────────────┐   │
                   │  │  PostgreSQL 5432   │   │
                   │  └────────────────────┘   │
                   └──────┬──┬──┬─────────────┘
                          │  │  │
              ┌───────────┘  │  └────────────┐
              │              │               │
      Win7 收银机     老板电脑/笔记本        手机 APK
      Chrome 全屏      Chrome 手动开        Capacitor
      /pos/            /admin/               扫 QR 拿 IP
```

---

## 硬件建议

**本地服务器**(推荐,一台就够):

| 项目 | 最低 | 推荐 |
|---|---|---|
| 系统 | Win10 x64 | Win10/11 或 Ubuntu 22.04 |
| CPU | 双核 2GHz | 4 核起 |
| 内存 | 4 GB | 8 GB |
| 硬盘 | 剩余 40 GB | SSD |
| 网络 | 有线连主路由 | 有线连主路由 |

> 一台七八年前的商用小主机就够,或者复用店里已有的一台电脑。**必须有线连路由**,别用 Wi-Fi —— 无线丢包会让所有客户端一起卡。

**收银机**:随便,能开 Chrome 就行。Win7/10/11、平板都可以。

**老板电脑**:随便,任何浏览器。

---

## 服务器部署

### 1. 一次性依赖

- **Node.js**:装 LTS(20 或 22)。Win10+ 官网下载 msi 一路 Next。Ubuntu 用 `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs`。
- **PostgreSQL 16**:官网下载安装包 / apt 装,或者用 Docker(项目里有 `docker-compose.yml`,`pnpm db:up` 一条命令)。设个密码记下来。
- **pnpm**:`npm install -g pnpm@9`。

### 2. 拷贝代码 + 构建

在开发机上 `pnpm build`,把整个仓库(含 `apps/*/dist`)拷到服务器 `D:\shouyin\`(Win)或 `/opt/shouyin/`(Linux)。也可以在服务器上直接 `git clone` + `pnpm install` + `pnpm build`。

### 3. 配数据库连接

编辑 `apps/api/.env`:

```
DATABASE_URL=postgresql://用户名:密码@localhost:5432/shouyin
JWT_SECRET=随便一串长的
PORT=3001
```

初始化数据:

```
cd apps\api
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
```

### 4. 启动

双击 `scripts\服务端启动.bat`(Win),或 `node apps/api/dist/src/main.js`(Linux,前台跑;后台用 pm2 或 systemd)。

看到这三行就 OK:

```
🚀 API 已启动 http://localhost:3001/api
🖥  收银台 http://localhost:3001/pos
⚙  管理后台 http://localhost:3001/admin
```

### 5. 查服务器 IP

Win 打开 cmd:

```
ipconfig
```

找 "以太网适配器" 下的 "IPv4 地址",记下来,比如 `192.168.1.100`。

Linux:`ip a | grep inet`。

**建议路由器里给这台服务器绑一个静态 IP**(或 DHCP 保留),不然重启后 IP 变了所有客户端都得重配。

### 6. 服务器开机自启

**Win**:Win+R → `shell:startup` → 把 `scripts\服务端启动.bat` 的快捷方式拖进去。想让 node 崩了自动拉回来,用 [nssm](https://nssm.cc/) 装成 Windows 服务:

```
nssm install shouyin "C:\Program Files\nodejs\node.exe" "D:\shouyin\apps\api\dist\src\main.js"
nssm set shouyin AppEnvironmentExtra "POS_DIST=D:\shouyin\apps\pos\dist" "ADMIN_DIST=D:\shouyin\apps\admin\dist"
nssm start shouyin
```

**Linux**:写个 systemd unit,或者用 pm2:

```
pm2 start apps/api/dist/src/main.js --name shouyin \
  --env POS_DIST=$PWD/apps/pos/dist ADMIN_DIST=$PWD/apps/admin/dist
pm2 save && pm2 startup
```

---

## 收银机部署(Win7 也行)

1. 装 Chrome(Win7 只能装 109;Win10+ 随意)
2. 拷 `scripts\收银机启动.bat` 到桌面
3. **编辑这个 bat**,把里面的 `SERVER_URL` 改成:
   ```
   set "SERVER_URL=http://192.168.1.100:3001/pos/"
   ```
   (把 `192.168.1.100` 换成你服务器的实际 IP)
4. 双击 → Chrome 全屏进收银台
5. 开机自启:Win+R → `shell:startup` → 把 bat 快捷方式拖进去
6. 员工登录:`cashier / cashier123`(seed 默认账号,记得进 admin 改密)

**换一台机器当收银机?** 上面步骤重来一次,没别的依赖。

**服务器 IP 变了?** 编辑桌面这个 bat 改一行,存盘,重启 Chrome。或者直接改成域名(下面进阶)。

---

## 老板电脑

不用装任何东西。任意 Chrome / Edge / Safari,地址栏输:

```
http://192.168.1.100:3001/admin/
```

登录用 `admin / admin123`(seed 默认账号,**装机后立刻改密**)。

想放到收藏夹或者做桌面快捷方式(Chrome:菜单 → 更多工具 → 创建快捷方式),日常一点就进。

---

## 手机 APK

跟原来一样:装 APK → 首次启动扫管理后台"手机接入"页里的 QR → 自动填服务器地址。

现在服务器 IP 就是新的服务器,QR 会自动生成正确的 URL,不用手输。

---

## 更新代码

只要更新服务器就行,客户端全部零维护(浏览器打开就是最新版):

1. 停 node(或 nssm stop)
2. `git pull` 或者覆盖 `apps/*/dist` 和 `apps/api/dist`
3. 需要迁移库就 `pnpm exec prisma migrate deploy`
4. 起 node

---

## 常见问题

**Q: 收银机 Chrome 弹"无法连接"?**
99% 是网络问题:
1. 服务器上的 node 没跑 → 双击 `服务端启动.bat` 查窗口
2. 收银机和服务器不在一个网段 → `ping 服务器IP` 通不通
3. 服务器防火墙拦了 3001 → Win 防火墙 → "允许应用" → 加 node.exe
4. IP 变了 → 编辑桌面 bat 里的 `SERVER_URL`

**Q: 断网了怎么办?**
- 收银机会看到"请求失败",等网通了刷新页面继续
- 手机 APK 支持离线入库,网通了自动上传(见项目 README)
- 服务器**不能**断电,配 UPS 或者放到有市电稳定的地方

**Q: 想给分店用?**
- 每个店一台服务器,数据隔离,各管各的
- 想合一起就是"多店铺"功能,需要改代码把 storeId 加到数据模型上,现在版本不支持

**Q: 想让手机不扫码就能连上?**
- 路由器里配一条 DNS 记录(比如 `pos.local` → `192.168.1.100`),或者用 mDNS / Bonjour 服务
- 见 `apps/mobile/README.md` 讨论,单店场景不值得折腾

**Q: 数据库备份?**
每天凌晨自动 dump。Win 用任务计划:

```
"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U postgres -d shouyin > D:\backup\shouyin_%date:~0,4%%date:~5,2%%date:~8,2%.sql
```

Linux:crontab + `pg_dump | gzip > /backup/...`。备份文件**同步一份到 U 盘或者网盘**,别只留在服务器硬盘上。

**Q: HTTPS 呢?**
纯内网、局域网,http 就行。如果要走公网,建议加个内网穿透 + Caddy 反代自动 Let's Encrypt。

---

## 服务器最终清单

- [ ] Node 20+ / pnpm 9
- [ ] PostgreSQL 装好并建库
- [ ] `apps/api/.env` 配好 `DATABASE_URL` / `JWT_SECRET`
- [ ] 迁移 + seed 跑过一次
- [ ] `服务端启动.bat` 双击能起,三条日志齐
- [ ] 路由器绑静态 IP
- [ ] Win 防火墙放行 3001
- [ ] 开机自启(nssm 或 shell:startup)
- [ ] admin 密码改过
- [ ] 每日 dump 定时任务

## 收银机最终清单(每台重复)

- [ ] Chrome 装了
- [ ] `收银机启动.bat` 里的 `SERVER_URL` 改对
- [ ] 双击能打开全屏收银台
- [ ] 快捷方式塞 `shell:startup`
- [ ] 重启一次电脑测自启
