// 老师端：所辖班级学生数据、材料审核、统计、导出
const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth, requireRole('teacher'));

// 当前老师所辖班级 id 列表
function myClassIds(teacherId) {
  return db.prepare('SELECT id FROM classes WHERE teacher_id=?').all(teacherId).map((r) => r.id);
}

// 所辖班级与学生
router.get('/classes', (req, res) => {
  const classes = db.prepare('SELECT * FROM classes WHERE teacher_id=?').all(req.user.id);
  const students = db.prepare(
    `SELECT id, username, name, class_id FROM users WHERE role='student' AND class_id IN (${classes.map(() => '?').join(',') || 'NULL'}) ORDER BY username`
  ).all(...classes.map((c) => c.id));
  res.json({ classes, students });
});

// 所辖学生材料列表（支持班级/状态/类别筛选）
router.get('/materials', (req, res) => {
  const ids = myClassIds(req.user.id);
  if (ids.length === 0) return res.json({ items: [] });
  const { class_id, status, category_id, q } = req.query;
  let sql = `SELECT m.*, u.name AS student_name, u.username, cl.name AS class_name, c.name AS category_name
             FROM materials m
             JOIN users u ON u.id = m.student_id
             LEFT JOIN classes cl ON cl.id = u.class_id
             LEFT JOIN categories c ON c.id = m.category_id
             WHERE u.class_id IN (${ids.map(() => '?').join(',')})`;
  const params = [...ids];
  if (class_id) { sql += ' AND u.class_id=?'; params.push(class_id); }
  if (status) { sql += ' AND m.status=?'; params.push(status); }
  if (category_id) { sql += ' AND m.category_id=?'; params.push(category_id); }
  if (q) { sql += ' AND (m.activity_name LIKE ? OR u.name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY m.created_at DESC';
  res.json({ items: db.prepare(sql).all(...params) });
});

// 审核材料：通过 / 驳回（附备注）
router.post('/materials/:id/review', (req, res) => {
  const { status, note = '' } = req.body || {};
  if (!['confirmed', 'rejected'].includes(status)) return res.status(400).json({ error: '非法审核状态' });
  const ids = myClassIds(req.user.id);
  const m = db.prepare(
    `SELECT m.*, u.class_id FROM materials m JOIN users u ON u.id=m.student_id WHERE m.id=?`
  ).get(req.params.id);
  if (!m || !ids.includes(m.class_id)) return res.status(404).json({ error: '材料不存在或不在您的管辖范围' });
  db.prepare('UPDATE materials SET status=?, review_note=? WHERE id=?').run(status, note, m.id);
  console.log(`[review] 老师#${req.user.id} 审核材料#${m.id} → ${status}${note ? `（${note}）` : ''}`);
  res.json({ ok: true });
});

// 统计：按类别 / 按级别 / 待审核数 / 学生汇总
router.get('/stats', (req, res) => {
  const ids = myClassIds(req.user.id);
  if (ids.length === 0) return res.json({ byCategory: [], byLevel: [], byStudent: [], pending: 0, total: 0 });
  const ph = ids.map(() => '?').join(',');
  const base = `FROM materials m JOIN users u ON u.id=m.student_id WHERE u.class_id IN (${ph})`;
  const byCategory = db.prepare(
    `SELECT COALESCE(c.name,'未分类') AS name, COUNT(*) AS count
     FROM materials m JOIN users u ON u.id=m.student_id
     LEFT JOIN categories c ON c.id=m.category_id
     WHERE u.class_id IN (${ph}) GROUP BY c.name ORDER BY count DESC`
  ).all(...ids);
  const byLevel = db.prepare(`SELECT COALESCE(NULLIF(m.level,''),'未知') AS name, COUNT(*) AS count ${base} GROUP BY m.level ORDER BY count DESC`).all(...ids);
  const byStudent = db.prepare(
    `SELECT u.name, u.username, COUNT(*) AS count,
            SUM(CASE WHEN m.status='pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN m.status='confirmed' THEN 1 ELSE 0 END) AS confirmed,
            SUM(CASE WHEN m.status='rejected' THEN 1 ELSE 0 END) AS rejected
     ${base} GROUP BY u.id ORDER BY count DESC`
  ).all(...ids);
  const pending = db.prepare(`SELECT COUNT(*) AS c ${base} AND m.status='pending'`).get(...ids).c;
  const total = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(...ids).c;
  const corrections = db.prepare(
    `SELECT cl.*, m.activity_name, u.name AS student_name FROM correction_logs cl
     JOIN materials m ON m.id=cl.material_id JOIN users u ON u.id=m.student_id
     WHERE u.class_id IN (${ph}) ORDER BY cl.created_at DESC LIMIT 20`
  ).all(...ids);
  res.json({ byCategory, byLevel, byStudent, pending, total, corrections });
});

// 导出班级汇总 CSV（Excel 可直接打开）
router.get('/export', (req, res) => {
  const ids = myClassIds(req.user.id);
  if (ids.length === 0) return res.status(400).json({ error: '您暂未分配班级' });
  const rows = db.prepare(
    `SELECT cl.name AS class_name, u.username, u.name AS student_name, c.name AS category,
            m.activity_name, m.activity_time, m.level, m.role_in_activity, m.award, m.status, m.review_note, m.created_at
     FROM materials m
     JOIN users u ON u.id=m.student_id
     LEFT JOIN classes cl ON cl.id=u.class_id
     LEFT JOIN categories c ON c.id=m.category_id
     WHERE u.class_id IN (${ids.map(() => '?').join(',')}) ORDER BY cl.name, u.username, m.created_at`
  ).all(...ids);
  const header = ['班级', '学号', '姓名', '类别', '活动名称', '活动时间', '级别', '角色', '获奖', '状态', '审核备注', '上传时间'];
  const statusMap = { pending: '待确认', confirmed: '已确认', rejected: '已驳回' };
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [header, ...rows.map((r) => [
    r.class_name, r.username, r.student_name, r.category, r.activity_name, r.activity_time,
    r.level, r.role_in_activity, r.award, statusMap[r.status] || r.status, r.review_note, r.created_at,
  ])].map((line) => line.map(esc).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('班级综测材料汇总.csv')}`);
  res.send(csv);
});

module.exports = router;
