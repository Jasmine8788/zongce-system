// 服务入口：Express 应用装配
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { db } = require('./db');
const { router: authRouter, requireAuth: auth } = require('./auth');

const app = express();
app.use(express.json({ limit: '2mb' }));

// CORS 白名单：通过 CORS_ORIGINS 配置（逗号分隔），留空则不限制（仅建议本地开发）
const allowlist = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowlist.length === 0 || allowlist.includes(origin)) return cb(null, true);
    return cb(new Error(`来源 ${origin} 不在 CORS 白名单中`));
  },
}));

// 上传文件静态服务（演示用本地磁盘；生产可替换为对象存储并返回公网 URL）
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 公共：启用的类别列表（登录后即可访问，用于下拉框）
app.get('/api/categories', auth, (req, res) => {
  res.json({ items: db.prepare('SELECT id, name, sort FROM categories WHERE enabled=1 ORDER BY sort').all() });
});

// 业务路由
app.use('/api/auth', authRouter);
app.use('/api/materials', require('./routes/materials'));
app.use('/api/teacher', require('./routes/teacher'));
app.use('/api/admin', require('./routes/admin'));

// 统一错误处理（含 multer 错误）
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '文件超过 10MB 限制' });
  res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
});

const PORT = Number(process.env.PORT) || 8080;
// 监听 0.0.0.0：保证容器/公网环境可被外部访问
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] 综测材料归集系统后端已启动: http://0.0.0.0:${PORT}`);
});
