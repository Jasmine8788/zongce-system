// 管理员端：账号管理（含批量创建/重置密码/禁用）、班级、类别字典、系统配置、全局看板
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getConfig, setConfig } = require('../db');
const { requireAuth, requireRole, checkPasswordStrength } = require('../auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

// 生成初始密码：4 位字母 + 4 位数字，保证满足强度规则
function genPassword() {
  const letters = Math.random().toString(36).replace(/[^a-z]/g, '').padEnd(4, 'x').slice(0, 4);
  return letters + Math.floor(Math.random() * 9000 + 1000);
}

// ---------- 账号管理 ----------
router.get('/users', (req, res) => {
  const items = db.prepare(
    `SELECT u.id, u.username, u.role, u.name, u.class_id, u.status, u.must_change_pwd, u.created_at, c.name AS class_name
     FROM users u LEFT JOIN classes c ON c.id=u.class_id ORDER BY u.role, u.username`
  ).all();
  res.json({ items });
});

// 单个创建账号（密码留空则自动生成）
router.post('/users', (req, res) => {
  const { username, name, role = 'student', class_id = null } = req.body || {};
  let { password } = req.body || {};
  if (!username || !name) return res.status(400).json({ error: '用户名和姓名必填' });
  if (!['student', 'teacher', 'admin'].includes(role)) return res.status(400).json({ error: '非法角色' });
  if (db.prepare('SELECT id FROM users WHERE username=?').get(username.trim())) {
    return res.status(400).json({ error: '用户名已存在' });
  }
  if (!password) password = genPassword();
  else if (!checkPasswordStrength(password)) return res.status(400).json({ error: '密码至少 6 位且含字母和数字' });
  const info = db.prepare(
    `INSERT INTO users(username, password_hash, role, name, class_id, status, must_change_pwd) VALUES(?,?,?,?,?,'active',1)`
  ).run(username.trim(), bcrypt.hashSync(password, 10), role, name.trim(), role === 'student' ? class_id : null);
  console.log(`[admin] 创建账号 ${username} (${role})`);
  res.json({ id: info.lastInsertRowid, username: username.trim(), password });
});

// 批量创建：lines 为文本，每行 "用户名,姓名,班级名[,角色]"，自动分配初始密码
router.post('/users/batch', (req, res) => {
  const { text = '' } = req.body || {};
  const results = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const [username, name, className, roleRaw] = line.split(/[,，\t]/).map((s) => (s || '').trim());
    const role = roleRaw || 'student';
    if (!username || !name) { results.push({ username: username || '-', name: name || '-', ok: false, error: '格式错误（需：用户名,姓名,班级）' }); continue; }
    if (!['student', 'teacher', 'admin'].includes(role)) { results.push({ username, name, ok: false, error: '非法角色' }); continue; }
    if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) { results.push({ username, name, ok: false, error: '用户名已存在' }); continue; }
    let class_id = null;
    if (role === 'student') {
      if (!className) { results.push({ username, name, ok: false, error: '学生必须指定班级' }); continue; }
      const cls = db.prepare('SELECT id FROM classes WHERE name=?').get(className);
      if (!cls) { results.push({ username, name, ok: false, error: `班级「${className}」不存在` }); continue; }
      class_id = cls.id;
    }
    const password = genPassword();
    db.prepare(`INSERT INTO users(username, password_hash, role, name, class_id, status, must_change_pwd) VALUES(?,?,?,?,?,'active',1)`)
      .run(username, bcrypt.hashSync(password, 10), role, name, class_id);
    results.push({ username, name, class: className || '', role, password, ok: true });
  }
  console.log(`[admin] 批量创建账号：成功 ${results.filter((r) => r.ok).length} 个，失败 ${results.filter((r) => !r.ok).length} 个`);
  res.json({ results });
});

// 更新账号：姓名 / 班级 / 角色 / 启用禁用
router.put('/users/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const { name = u.name, class_id = u.class_id, role = u.role, status = u.status } = req.body || {};
  if (u.id === req.user.id && status === 'disabled') return res.status(400).json({ error: '不能禁用自己的账号' });
  if (!['active', 'disabled'].includes(status)) return res.status(400).json({ error: '非法状态' });
  db.prepare('UPDATE users SET name=?, class_id=?, role=?, status=? WHERE id=?').run(name, class_id, role, status, u.id);
  res.json({ ok: true });
});

// 重置密码：生成新密码并强制下次登录修改
router.post('/users/:id/reset-password', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const password = genPassword();
  db.prepare('UPDATE users SET password_hash=?, must_change_pwd=1 WHERE id=?').run(bcrypt.hashSync(password, 10), u.id);
  console.log(`[admin] 重置用户 ${u.username} 的密码`);
  res.json({ username: u.username, password });
});

// 导出账号清单 CSV（不含密码哈希）
router.get('/users-export', (req, res) => {
  const rows = db.prepare(
    `SELECT u.username, u.name, u.role, c.name AS class_name, u.status, u.created_at
     FROM users u LEFT JOIN classes c ON c.id=u.class_id ORDER BY u.role, u.username`
  ).all();
  const roleMap = { student: '学生', teacher: '老师', admin: '管理员' };
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [['用户名', '姓名', '角色', '班级', '状态', '创建时间'],
    ...rows.map((r) => [r.username, r.name, roleMap[r.role], r.class_name, r.status === 'active' ? '启用' : '禁用', r.created_at]),
  ].map((l) => l.map(esc).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('账号清单.csv')}`);
  res.send(csv);
});

// ---------- 班级管理 ----------
router.get('/classes', (req, res) => {
  const items = db.prepare(
    `SELECT c.*, u.name AS teacher_name,
            (SELECT COUNT(*) FROM users s WHERE s.class_id=c.id AND s.role='student') AS student_count
     FROM classes c LEFT JOIN users u ON u.id=c.teacher_id ORDER BY c.id`
  ).all();
  res.json({ items });
});

router.post('/classes', (req, res) => {
  const { name, teacher_id = null } = req.body || {};
  if (!name) return res.status(400).json({ error: '班级名必填' });
  try {
    const info = db.prepare('INSERT INTO classes(name, teacher_id) VALUES(?,?)').run(name.trim(), teacher_id || null);
    res.json({ id: info.lastInsertRowid });
  } catch { res.status(400).json({ error: '班级名已存在' }); }
});

router.put('/classes/:id', (req, res) => {
  const { name, teacher_id = null } = req.body || {};
  const cls = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!cls) return res.status(404).json({ error: '班级不存在' });
  db.prepare('UPDATE classes SET name=?, teacher_id=? WHERE id=?').run(name || cls.name, teacher_id || null, cls.id);
  res.json({ ok: true });
});

router.delete('/classes/:id', (req, res) => {
  const cnt = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE class_id=? AND role='student'`).get(req.params.id).c;
  if (cnt > 0) return res.status(400).json({ error: `该班级下还有 ${cnt} 名学生，无法删除` });
  db.prepare('DELETE FROM classes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- 类别字典 ----------
router.get('/categories', (req, res) => {
  res.json({ items: db.prepare('SELECT * FROM categories ORDER BY sort').all() });
});

router.post('/categories', (req, res) => {
  const { name, sort = 0 } = req.body || {};
  if (!name) return res.status(400).json({ error: '类别名必填' });
  try {
    const info = db.prepare('INSERT INTO categories(name, sort, enabled) VALUES(?,?,1)').run(name.trim(), Number(sort) || 0);
    res.json({ id: info.lastInsertRowid });
  } catch { res.status(400).json({ error: '类别名已存在' }); }
});

router.put('/categories/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: '类别不存在' });
  const { name = cat.name, sort = cat.sort, enabled = cat.enabled } = req.body || {};
  db.prepare('UPDATE categories SET name=?, sort=?, enabled=? WHERE id=?').run(name, Number(sort) || 0, enabled ? 1 : 0, cat.id);
  res.json({ ok: true });
});

router.delete('/categories/:id', (req, res) => {
  const cnt = db.prepare('SELECT COUNT(*) AS c FROM materials WHERE category_id=?').get(req.params.id).c;
  if (cnt > 0) return res.status(400).json({ error: `已有 ${cnt} 条材料使用该类别，建议改为“停用”` });
  db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- 系统配置 ----------
const CONFIG_KEYS = ['ai_base_url', 'ai_api_key', 'ai_model', 'confidence_threshold'];

router.get('/config', (req, res) => {
  const cfg = getConfig();
  const out = {};
  for (const k of CONFIG_KEYS) out[k] = cfg[k] || '';
  res.json({ config: out });
});

router.put('/config', (req, res) => {
  for (const k of CONFIG_KEYS) {
    if (req.body[k] !== undefined) setConfig(k, req.body[k]);
  }
  console.log('[admin] 更新系统配置');
  res.json({ ok: true });
});

// ---------- 全局看板 ----------
router.get('/stats', (req, res) => {
  const usersByRole = db.prepare(`SELECT role, COUNT(*) AS count FROM users GROUP BY role`).all();
  const total = db.prepare('SELECT COUNT(*) AS c FROM materials').get().c;
  const pending = db.prepare(`SELECT COUNT(*) AS c FROM materials WHERE status='pending'`).get().c;
  const byCategory = db.prepare(
    `SELECT COALESCE(c.name,'未分类') AS name, COUNT(*) AS count FROM materials m
     LEFT JOIN categories c ON c.id=m.category_id GROUP BY c.name ORDER BY count DESC`
  ).all();
  const recent7 = db.prepare(
    `SELECT date(created_at) AS day, COUNT(*) AS count FROM materials
     WHERE created_at >= datetime('now','localtime','-6 days','start of day')
     GROUP BY date(created_at) ORDER BY day`
  ).all();
  const corrections = db.prepare('SELECT COUNT(*) AS c FROM correction_logs').get().c;
  res.json({ usersByRole, total, pending, byCategory, recent7, corrections });
});

module.exports = router;
