# 收银系统 · Docker 一键部署

**5 分钟从零起系统**,不装 Node、不装 Postgres、不装任何依赖 —— 只要机器上有 Docker。

---

## 前置

- 服务器上装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)(Win/Mac)或 [Docker Engine](https://docs.docker.com/engine/install/)(Linux)
- 硬件:2 核 4G 内存 20G 硬盘起
- 系统:Win10+、Ubuntu 20.04+、macOS 都行(Win7 不行,Docker Desktop 不支持)

---

## 5 分钟起步

### 1. 拿代码

```bash
git clone <你的仓库> shouyin
cd shouyin
```

或直接把整个仓库文件夹拷到服务器。

### 2. 配环境变量

```bash
cp .env.docker.example .env
```

编辑 `.env`,**改这四项**(其他默认就行):

```env
JWT_SECRET=换成随便一串长的,openssl rand -base64 48 生成一个
SEED_ADMIN_PASSWORD=你想给老板设的初始密码
SEED_CASHIER_PASSWORD=收银员默认密码
API_PORT=3001                       # 想换端口就改这里
```

> `.env` 已经加进 `.gitignore`,不会被误提交。

### 3. 一键起

```bash
docker compose up -d
```

**首次运行会**:

1. 拉 postgres:16-alpine 镜像(~ 80MB)
2. 构建 shouyin/api 镜像(内含 API + 收银台 + 管理后台,~630MB)
3. 起 Postgres,等它 ready
4. 起 API 容器,自动:
   - 探活数据库
   - `prisma db push` 建表
   - 首次运行(空库)跑 seed,把种子数据用你在 `.env` 里设的密码写进去
   - 起 NestJS

进度看:

```bash
docker compose logs -f api
```

看到这三行就成功:

```
🚀 API 已启动 http://localhost:3001/api
🖥  收银台 http://localhost:3001/pos
⚙  管理后台 http://localhost:3001/admin
```

### 4. 用起来

- 收银台:`http://<服务器IP>:3001/pos/`
  - 用 seed 建的 `cashier / <SEED_CASHIER_PASSWORD>` 登录
- 管理后台:`http://<服务器IP>:3001/admin/`
  - 用 `admin / <SEED_ADMIN_PASSWORD>` 登录
- 手机 APK:装完 APK 打开会进"扫码绑定服务器"页,扫管理后台"移动端配置"里的 QR 就行
- 顶级路径 `http://<服务器IP>:3001/` 会自动 302 到 `/pos/`

---

## 日常运维

### 停 / 起 / 重启

```bash
docker compose down                 # 停(容器删掉,数据卷保留 → 数据全在)
docker compose up -d                # 起(数据继续用之前的)
docker compose restart api          # 只重启 API,DB 不动
docker compose logs -f api          # 看后端实时日志
```

### 更新代码

```bash
git pull                            # 或者手动覆盖代码目录
docker compose build api            # 重建镜像
docker compose up -d api            # 用新镜像起,数据卷不动
```

**前端零维护** —— 前端 dist 已经打进镜像,后台/收银台的浏览器缓存刷新一下就是新版。

### 备份

Postgres 数据在名为 `shouyin_shouyin-pg` 的 volume 里(compose 项目名前缀可能不同,`docker volume ls` 看)。备份:

```bash
# 导出:每天凌晨 3 点跑,cron / 任务计划都行
docker exec shouyin-postgres pg_dump -U shouyin shouyin > backup_$(date +%F).sql

# 恢复:先 down,把数据文件塞回去,再 up
docker compose down
cat backup_2026-07-15.sql | docker compose run --rm -T postgres psql -U shouyin -d shouyin
docker compose up -d
```

**备份文件同步一份到 U 盘或云盘**,别只留在服务器硬盘。

### 想看数据库

```bash
docker compose --profile debug up -d adminer     # 启一个 Adminer
# 浏览器打开 http://<服务器IP>:8080
#   Server: postgres  User: shouyin  Password: shouyin  Database: shouyin
```

看完关掉:

```bash
docker compose stop adminer
```

### 清空数据重来(⚠️ 慎用)

```bash
docker compose down -v              # -v 会一起删数据卷
docker compose up -d                # 起一个全新的
```

现在 `.env` 里的 `SEED_*` 密码会重新生效(seed 只在空库时跑)。

---

## 加固

### 生产环境要做的三件事

1. **改 JWT_SECRET**:`.env` 里那个占位符必须换成真实的随机字符串。生成:
   ```bash
   openssl rand -base64 48
   ```

2. **不要暴露 5432**:`docker-compose.yml` 里 postgres 的 `ports: - "5432:5432"` 是给开发用的,生产建议**注释掉**这一行 —— API 通过 compose 内部网络就能连上,外面无需能碰到数据库。改完 `docker compose up -d` 重建。

3. **只暴露 3001,别开公网**:如果服务器有公网 IP,防火墙**只放行局域网段**(如 192.168.x.x 段),别让路人扫到。要在店外访问就上内网穿透 + HTTPS。

### 开机自启

Docker 服务自身要开机自启(装 Docker 时默认就是),我们容器里 `restart: unless-stopped` 保证宿主 Docker 起了以后自动跑。**验证**:重启服务器一次,不做任何操作,`docker ps` 应该能看到两个容器都 up。

### 资源限制(可选)

小主机想限制内存,`docker-compose.yml` 的 api service 下加:

```yaml
    deploy:
      resources:
        limits:
          memory: 1g
          cpus: '1.0'
```

---

## 常见问题

**Q: 构建时拉不到 node:20-alpine**
国内镜像慢/超时。三种解:

1. 配 Docker daemon 镜像加速(推荐):
   `~/.docker/daemon.json` 加:
   ```json
   { "registry-mirrors": ["https://docker.m.daocloud.io"] }
   ```
   重启 Docker Desktop。

2. 用 build-arg 换基础镜像:
   ```bash
   docker compose build --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:20-alpine api
   ```

3. 让有网络的开发机 `docker save` 出 tar,`docker load` 到服务器。

**Q: seed 没跑,admin 密码是我 `.env` 里设的吗?**

看日志:

```bash
docker compose logs api | grep entrypoint
```

- 说 "执行首次 seed" 说明用了你的 SEED_* 密码 ✓
- 说 "跳过 seed(库已有 xx 条)" 说明是老数据,`.env` 里的 SEED_* 已经不起作用了

想强制重来:`docker compose down -v && docker compose up -d`。

**Q: 收银机/手机连过来"无法连接"**
1. `docker ps` 看两个容器都在 Up
2. 服务器 `curl http://localhost:3001/api/ping` 通 → 后端 OK,是网络问题
3. Windows 防火墙放行 3001 端口
4. 客户端 `ping <服务器IP>` 通不通

**Q: 数据存在哪?我能不能直接 cp 出来?**

docker volume 数据在 `/var/lib/docker/volumes/shouyin_shouyin-pg/_data`(Linux)或 Docker Desktop 的 VM 里(Win/Mac 看不到裸文件)。**别直接 cp**,用 `pg_dump` 才是干净的备份。

**Q: 我想 host 一台机器上跑多个店的实例**

改 compose 项目名 + 端口就好:

```bash
COMPOSE_PROJECT_NAME=shouyin-store1 API_PORT=3001 docker compose up -d
COMPOSE_PROJECT_NAME=shouyin-store2 API_PORT=3002 docker compose up -d
```

数据卷、网络、容器名都会带前缀隔开,互不影响。

---

## 最终 checklist

- [ ] Docker 装了并开机自启
- [ ] 代码拷到服务器
- [ ] `.env` 里 `JWT_SECRET` / `SEED_*` 都改了
- [ ] `docker compose up -d` 起来
- [ ] `docker compose logs api` 看到"🚀 API 已启动"
- [ ] 浏览器打开 `http://<服务器IP>:3001/pos/` 能进
- [ ] 用 admin 登录后立刻改密码(网页右上角"修改密码")
- [ ] 路由器给服务器绑静态 IP
- [ ] 防火墙放行 3001
- [ ] 每日 `pg_dump` 备份定时任务
- [ ] 备份文件同步到外部(U 盘/网盘)
