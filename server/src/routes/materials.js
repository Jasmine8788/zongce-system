// 学生端：材料上传、AI 归集、列表筛选、编辑纠错、重新分类、删除、导出
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, getConfig } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { extractText, classify } = require('../ai');

const router = express.Router();
router.use(requireAuth, requireRole('student'));

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = { 'image/jpeg': true, 'image/png': true, 'application/pdf': true };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 9 }, // 单文件最大 10MB，一次最多 9 个
  fileFilter: (req, file, cb) => {
    if (!ALLOWED[file.mimetype]) return cb(new Error('仅支持 jpg / png 图片或 PDF 文件'));
    cb(null, true);
  },
});

const catName = (id) => db.prepare('SELECT name FROM categories WHERE id=?').get(id)?.name || '';

// 上传材料（可多文件）：入库后立即进行 AI 分类
router.post('/', upload.array('files', 9), async (req, res, next) => {
  try {
    const { activity_name = '', activity_time = '', organizer = '' } = req.body || {};
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: '请选择要上传的文件' });

    const threshold = parseFloat(getConfig().confidence_threshold) || 0.7;
    const categories = db.prepare('SELECT * FROM categories WHERE enabled=1 ORDER BY sort').all();
    const created = [];

    for (const file of req.files) {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const text = await extractText(file.path, file.mimetype);
      const result = await classify({
        text, filename: originalName, activityName: activity_name,
        mime: file.mimetype, filePath: file.path, categories,
      });
      const status = result.confidence >= threshold ? 'confirmed' : 'pending';
      const info = db.prepare(`
        INSERT INTO materials(student_id, file_url, file_type, original_name, activity_name, activity_time,
          organizer, level, role_in_activity, award, tags, category_id, ai_confidence, ai_source, ai_raw_json, status)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        req.user.id, `/uploads/${file.filename}`, file.mimetype, originalName,
        result.activityName || activity_name, activity_time || result.activityTime, organizer,
        result.level, result.role, result.award, JSON.stringify(result.tags || []),
        result.categoryId, result.confidence, result.source, result.raw || '', status
      );
      console.log(`[material] 学生#${req.user.id} 上传「${originalName}」→ ${result.categoryName}(${(result.confidence * 100).toFixed(0)}%, ${result.source})`);
      created.push(db.prepare('SELECT * FROM materials WHERE id=?').get(info.lastInsertRowid));
    }
    res.json({ items: created });
  } catch (e) { next(e); }
});

// 我的材料列表（支持类别/状态/关键词筛选）
router.get('/', (req, res) => {
  const { category_id, status, q } = req.query;
  let sql = `SELECT m.*, c.name AS category_name FROM materials m
             LEFT JOIN categories c ON c.id = m.category_id WHERE m.student_id=?`;
  const params = [req.user.id];
  if (category_id) { sql += ' AND m.category_id=?'; params.push(category_id); }
  if (status) { sql += ' AND m.status=?'; params.push(status); }
  if (q) { sql += ' AND (m.activity_name LIKE ? OR m.original_name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY m.created_at DESC';
  res.json({ items: db.prepare(sql).all(...params) });
});

// 编辑修正（类别变更会记录纠错日志，修正后视为已确认）
router.put('/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM materials WHERE id=?').get(req.params.id);
  if (!m || m.student_id !== req.user.id) return res.status(404).json({ error: '材料不存在' });

  const { activity_name, activity_time, organizer, level, role_in_activity, award, category_id } = req.body || {};
  const newCat = db.prepare('SELECT * FROM categories WHERE id=?').get(category_id);
  if (!newCat) return res.status(400).json({ error: '请选择有效类别' });

  if (m.category_id !== newCat.id) {
    db.prepare('INSERT INTO correction_logs(material_id, old_category, new_category, user_id) VALUES(?,?,?,?)')
      .run(m.id, catName(m.category_id), newCat.name, req.user.id);
    console.log(`[correction] 材料#${m.id}: ${catName(m.category_id)} → ${newCat.name}（学生纠错）`);
  }
  db.prepare(`UPDATE materials SET activity_name=?, activity_time=?, organizer=?, level=?,
              role_in_activity=?, award=?, category_id=?, status='confirmed' WHERE id=?`)
    .run(activity_name, activity_time, organizer, level, role_in_activity, award, newCat.id, m.id);
  res.json({ item: db.prepare('SELECT * FROM materials WHERE id=?').get(m.id) });
});

// 重新分类
router.post('/:id/reclassify', async (req, res, next) => {
  try {
    const m = db.prepare('SELECT * FROM materials WHERE id=?').get(req.params.id);
    if (!m || m.student_id !== req.user.id) return res.status(404).json({ error: '材料不存在' });
    const filePath = path.join(UPLOAD_DIR, path.basename(m.file_url));
    const categories = db.prepare('SELECT * FROM categories WHERE enabled=1 ORDER BY sort').all();
    const text = await extractText(filePath, m.file_type);
    const result = await classify({ text, filename: m.original_name, activityName: m.activity_name, mime: m.file_type, filePath, categories });
    const threshold = parseFloat(getConfig().confidence_threshold) || 0.7;
    const status = result.confidence >= threshold ? 'confirmed' : 'pending';
    db.prepare(`UPDATE materials SET activity_name=?, activity_time=?, level=?, role_in_activity=?, award=?,
                tags=?, category_id=?, ai_confidence=?, ai_source=?, ai_raw_json=?, status=? WHERE id=?`)
      .run(result.activityName, m.activity_time || result.activityTime, result.level, result.role, result.award,
        JSON.stringify(result.tags || []), result.categoryId, result.confidence, result.source, result.raw || '', status, m.id);
    res.json({ item: db.prepare('SELECT * FROM materials WHERE id=?').get(m.id) });
  } catch (e) { next(e); }
});

// 删除材料（同时删除磁盘文件）
router.delete('/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM materials WHERE id=?').get(req.params.id);
  if (!m || m.student_id !== req.user.id) return res.status(404).json({ error: '材料不存在' });
  db.prepare('DELETE FROM correction_logs WHERE material_id=?').run(m.id);
  db.prepare('DELETE FROM materials WHERE id=?').run(m.id);
  try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(m.file_url))); } catch { /* 文件可能已不存在 */ }
  res.json({ ok: true });
});

module.exports = router;
