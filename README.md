# 学生综合素质测评（综测）材料归集系统

学生在平时随时上传活动证明材料，系统通过 AI 自动识别、分类、打标签并汇总为结构化条目；综测填报期一键导出填报清单。包含**学生端 / 老师端 / 管理员端**三端，前后端分离，可本地运行，也可分别部署到公网（任意网络可访问）。

## 功能总览

| 端 | 功能 |
| --- | --- |
| 学生端 | 上传证明（jpg/png/pdf，多文件，手机拍照）、AI 自动分类与字段抽取、低置信度“待确认”一键修正（记录纠错日志）、材料库筛选/搜索/预览/删除/重新分类、按类别汇总导出填报清单（CSV/打印 PDF/复制文本）、修改密码 |
| 老师端 | 所辖班级学生材料汇总、按类别/级别统计图表、审核（通过/驳回+备注）、查看 AI 置信度与纠错记录、导出班级汇总 CSV、修改密码 |
| 管理员端 | 账号管理（单个创建/批量粘贴创建并自动生成初始密码/导出清单/重置密码/禁用启用）、班级与班主任分配、综测类别字典维护、系统配置（AI Key/模型/置信度阈值）、全局统计看板 |

## 技术栈

- 前端：React 18 + Vite 5 + TailwindCSS 3 + React Router 6 + Axios
- 后端：Node.js 20 + Express 4 + better-sqlite3 + JWT + bcryptjs + multer
- 数据库：SQLite（零配置，文件持久化；切换 PostgreSQL 仅需替换 `server/src/db.js` 数据访问层）
- AI 分类：OpenAI 兼容大模型 API（可配置 Key）；**无 Key 时自动降级为关键词规则分类，演示全流程可用**

## 项目结构

```
zongce-system/
├── docker-compose.yml        # 一键部署（云服务器）
├── README.md
├── server/                   # 后端
│   ├── Dockerfile
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── index.js          # 入口：CORS、静态文件、路由装配
│       ├── db.js             # SQLite 建表 + 种子数据
│       ├── auth.js           # JWT / 登录 / 修改密码
│       ├── ai.js             # 大模型分类 + 关键词规则兜底
│       └── routes/
│           ├── materials.js  # 学生端：上传/列表/纠错/重分类/删除
│           ├── teacher.js    # 老师端：汇总/审核/统计/导出
│           └── admin.js      # 管理员端：账号/班级/类别/配置/看板
└── web/                      # 前端
    ├── Dockerfile
    ├── nginx.conf
    ├── .env.example
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── api.js            # axios 实例（VITE_API_BASE_URL）
        ├── auth.jsx          # 登录态上下文
        ├── App.jsx           # 路由 + 角色守卫 + 强制改密
        ├── components/       # UI 小组件、修改密码
        └── pages/            # Login / StudentApp / TeacherApp / AdminApp
```

## 一、本地开发

要求：Node.js ≥ 18（推荐 20）。

```bash
# 1. 启动后端（首次启动自动建库并写入种子数据）
cd server
cp .env.example .env        # Windows 用 copy .env.example .env
npm install
npm run dev                 # http://localhost:8080

# 2. 启动前端（另开终端）
cd web
cp .env.example .env        # 本地开发 VITE_API_BASE_URL 留空即可（走 vite 代理）
npm install
npm run dev                 # http://localhost:5173
```

打开 http://localhost:5173 ，使用演示账号登录：

| 角色 | 账号 | 密码 | 说明 |
| --- | --- | --- | --- |
| 管理员 | `admin` | `admin123` | 账号/班级/类别/配置/看板 |
| 老师 | `teacher01` | `teacher123` | 负责 计算机2301班 |
| 老师 | `teacher02` | `teacher123` | 负责 计算机2302班 |
| 学生 | `student01`~`student03` | `student123` | 计算机2301班 |
| 学生 | `student04`~`student05` | `student123` | 计算机2302班 |

## 二、环境变量

### 后端 `server/.env`

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 服务端口 | `8080` |
| `JWT_SECRET` | JWT 签名密钥，**生产必须修改** | `please-change-me-in-production` |
| `CORS_ORIGINS` | 允许访问的前端域名，逗号分隔；留空不限制（仅限开发） | 空 |
| `DATA_DIR` / `UPLOAD_DIR` | SQLite 与上传文件目录 | `./data` / `./uploads` |
| `AI_BASE_URL` | OpenAI 兼容接口地址 | `https://api.openai.com/v1` |
| `AI_API_KEY` | 大模型 Key（留空走规则兜底） | 空 |
| `AI_MODEL` | 模型名（识别图片建议视觉模型） | `gpt-4o-mini` |
| `AI_CONFIDENCE_THRESHOLD` | 置信度阈值，低于则“待确认” | `0.7` |

> 以上 AI 配置也可在**管理员端 → 系统配置**中在线修改（数据库配置优先，此处作为初始值）。

### 前端 `web/.env`

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE_URL` | 后端公网地址，如 `https://your-api.onrender.com`。**禁止写死内网 IP**；本地开发留空走 vite 代理 |

## 三、AI 配置说明

1. 在管理员端 → 系统配置中填入 AI 接口地址、API Key、模型名，保存后立即生效。
2. 任意 OpenAI 兼容服务均可：OpenAI、Azure OpenAI（兼容端点）、DeepSeek、通义千问（DashScope 兼容模式）、Moonshot 等，只需替换 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`。
3. 图片材料会以 base64 形式随请求发送，建议使用具备视觉能力的模型（如 `gpt-4o-mini`、`qwen-vl-max`）；PDF 材料先做文本抽取再分类。
4. **未配置 Key 或调用失败时**，系统自动使用文件名 + 学生填写信息 + PDF 文本做关键词规则分类（来源标记为“规则”），置信度较低会进入“待确认”，学生确认后照常汇总导出——保证无 Key 演示全流程可用。

## 四、公网部署（核心：任意网络可访问）

架构：前端静态托管 + 后端公网服务 + SQLite 持久卷。部署后手机 4G、校园网、家庭宽带均可访问，**代码中不含任何内网 IP / localhost 依赖**（API 地址全部来自环境变量）。

### 方案 A：托管平台（推荐，免费额度即可）

1. **后端 → Render / Railway / Fly.io**
   - 新建 Web Service，仓库选择本项目的 `server/` 目录（或根目录 + 自定义启动命令 `node server/src/index.js`）。
   - 环境变量：`JWT_SECRET=随机长字符串`，`CORS_ORIGINS=https://你的前端域名`。
   - 挂载持久卷到 `/app/data` 与 `/app/uploads`（Render: Disks；Railway: Volumes），保证 SQLite 与上传文件不丢失。
   - 部署完成后得到后端公网地址，如 `https://zongce-api.onrender.com`，访问 `https://.../api/health` 应返回 `{"ok":true}`。
2. **前端 → Vercel / Netlify / Cloudflare Pages**
   - 根目录设为 `web/`，构建命令 `npm run build`，产物目录 `dist`。
   - 环境变量：`VITE_API_BASE_URL=https://zongce-api.onrender.com`。
   - 部署后得到前端地址，如 `https://zongce.vercel.app`。
3. 回到后端把 `CORS_ORIGINS` 设置为该前端地址并重启。

### 方案 B：云服务器 + Docker Compose

```bash
git clone <你的仓库> && cd zongce-system

# 配置环境：前端访问后端的地址（示例为服务器公网 IP；有域名请用 https 域名）
export VITE_API_BASE_URL="http://服务器公网IP:8080"
export CORS_ORIGINS="http://服务器公网IP"
# 可选：注入 AI Key
export AI_API_KEY="sk-..."

docker compose up -d --build
```

- 前端：`http://服务器公网IP`（nginx，80 端口）
- 后端：`http://服务器公网IP:8080`（SQLite 与上传文件持久化在 docker volume）
- 云服务器安全组需放行 80 与 8080 端口；生产建议为后端套一层 Nginx + HTTPS 域名。

### 方案 C：临时演示（内网穿透，仅限临时使用）

后端在本地启动后，用 `cloudflared tunnel --url http://localhost:8080`（或 ngrok/frp）得到临时公网地址，前端构建时把 `VITE_API_BASE_URL` 指向它即可。**正式方案请使用 A 或 B。**

## 五、常见问题（FAQ）

1. **上传后分类不准确？** 置信度低于阈值的条目会进入“待确认”，在“我的材料”中编辑修正即可；修正会写入纠错日志供后续优化。配置视觉模型 Key 可显著提升图片识别效果。
2. **Excel 打开 CSV 乱码？** 导出文件已带 UTF-8 BOM，正常 Excel 双击打开无乱码；若用 WPS 旧版请在打开时选择 UTF-8 编码。
3. **忘记密码？** 找管理员在“账号管理”中重置；新账号与重置后的账号首次登录会被强制要求修改密码。
4. **公网部署后提示 CORS 错误？** 检查后端 `CORS_ORIGINS` 是否与浏览器地址栏中的前端域名完全一致（含 `https://`，不带尾部斜杠）。
5. **Render/Railway 重启后数据丢失？** 未挂载持久卷导致，请为 `/app/data`、`/app/uploads` 挂载磁盘（见方案 A 第 1 步）。
6. **想换 PostgreSQL？** 数据访问集中在 `server/src/db.js`，用 `pg` 替换 better-sqlite3 并保持导出接口（`db.prepare` 调用处）一致即可。
7. **上传限制？** 默认单文件 10MB、一次最多 9 个，支持 jpg/png/pdf；可在 `server/src/routes/materials.js` 的 multer 配置中调整。
8. **如何彻底重置演示数据？** 停止服务后删除 `server/data/zongce.db` 与 `server/uploads/*`，重启即重新初始化种子数据。
