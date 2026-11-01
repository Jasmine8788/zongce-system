// 认证与密码相关：JWT 签发/校验、登录、修改密码
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}

// 鉴权中间件
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

// 角色守卫
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: '无权限访问' });
    next();
  };
}

// 密码强度：至少 6 位，且同时包含字母和数字
function checkPasswordStrength(pwd) {
  return typeof pwd === 'string' && pwd.length >= 6 && /[A-Za-z]/.test(pwd) && /\d/.test(pwd);
}

function publicUser(u) {
  return {
    id: u.id, username: u.username, role: u.role, name: u.name,
    class_id: u.class_id, status: u.status, must_change_pwd: !!u.must_change_pwd,
  };
}

const router = express.Router();

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(String(username).trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  if (user.status !== 'active') return res.status(403).json({ error: '账号已被禁用，请联系管理员' });
  console.log(`[auth] 登录成功: ${user.username} (${user.role})`);
  res.json({ token: sign(user), user: publicUser(user) });
});

// 当前登录人
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user: publicUser(user) });
});

// 修改自己的密码（校验旧密码 + 新密码强度）
router.post('/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user || !bcrypt.compareSync(oldPassword || '', user.password_hash)) {
    return res.status(400).json({ error: '原密码不正确' });
  }
  if (!checkPasswordStrength(newPassword)) {
    return res.status(400).json({ error: '新密码至少 6 位，且需同时包含字母和数字' });
  }
  db.prepare('UPDATE users SET password_hash=?, must_change_pwd=0 WHERE id=?')
    .run(bcrypt.hashSync(newPassword, 10), user.id);
  console.log(`[auth] 用户 ${user.username} 修改了密码`);
  res.json({ ok: true });
});

module.exports = { router, requireAuth, requireRole, sign, publicUser, checkPasswordStrength, JWT_SECRET };
