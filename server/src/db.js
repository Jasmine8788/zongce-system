// 数据库初始化与种子数据（首次启动自动建表、写入演示账号）
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'zongce.db'));
db.pragma('journal_mode = WAL');

// ---------- 建表 ----------
db.exec(`
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  teacher_id INTEGER
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','teacher','admin')),
  name TEXT NOT NULL,
  class_id INTEGER REFERENCES classes(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  must_change_pwd INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id),
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  activity_name TEXT,
  activity_time TEXT,
  organizer TEXT,
  level TEXT,
  role_in_activity TEXT,
  award TEXT,
  tags TEXT,
  category_id INTEGER REFERENCES categories(id),
  ai_confidence REAL,
  ai_source TEXT,
  ai_raw_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected')),
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS correction_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id),
  old_category TEXT,
  new_category TEXT,
  user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// ---------- 系统配置 ----------
function getConfig() {
  const rows = db.prepare('SELECT key, value FROM system_config').all();
  const cfg = {};
  for (const r of rows) cfg[r.key] = r.value;
  // 环境变量作为兜底（数据库为空时生效），方便 docker/云平台直接注入
  cfg.ai_base_url = cfg.ai_base_url || process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  cfg.ai_api_key = cfg.ai_api_key || process.env.AI_API_KEY || '';
  cfg.ai_model = cfg.ai_model || process.env.AI_MODEL || 'gpt-4o-mini';
  cfg.confidence_threshold = cfg.confidence_threshold || process.env.AI_CONFIDENCE_THRESHOLD || '0.7';
  return cfg;
}

function setConfig(key, value) {
  db.prepare('INSERT INTO system_config(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, String(value ?? ''));
}

// ---------- 种子数据（仅当 users 表为空时执行） ----------
function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  console.log('[seed] 首次启动，写入种子数据...');
  const hash = (pwd) => bcrypt.hashSync(pwd, 10);

  const insertClass = db.prepare('INSERT INTO classes(name, teacher_id) VALUES(?, ?)');
  const insertUser = db.prepare(
    'INSERT INTO users(username, password_hash, role, name, class_id, status, must_change_pwd) VALUES(?,?,?,?,?,?,0)'
  );

  const tx = db.transaction(() => {
    // 班级（teacher_id 稍后回填）
    const c1 = insertClass.run('计算机2301班', null).lastInsertRowid;
    const c2 = insertClass.run('计算机2302班', null).lastInsertRowid;

    // 管理员
    insertUser.run('admin', hash('admin123'), 'admin', '系统管理员', null, 'active');

    // 老师
    const t1 = insertUser.run('teacher01', hash('teacher123'), 'teacher', '张伟', null, 'active').lastInsertRowid;
    const t2 = insertUser.run('teacher02', hash('teacher123'), 'teacher', '李静', null, 'active').lastInsertRowid;
    db.prepare('UPDATE classes SET teacher_id=? WHERE id=?').run(t1, c1);
    db.prepare('UPDATE classes SET teacher_id=? WHERE id=?').run(t2, c2);

    // 学生（分属两个班级）
    insertUser.run('student01', hash('student123'), 'student', '王明', c1, 'active');
    insertUser.run('student02', hash('student123'), 'student', '刘洋', c1, 'active');
    insertUser.run('student03', hash('student123'), 'student', '陈晨', c1, 'active');
    insertUser.run('student04', hash('student123'), 'student', '赵雪', c2, 'active');
    insertUser.run('student05', hash('student123'), 'student', '孙强', c2, 'active');

    // 综测类别字典
    const cats = ['思想品德', '学业成绩', '科技创新', '文体活动', '社会实践', '志愿服务', '学生工作', '其他'];
    const insCat = db.prepare('INSERT INTO categories(name, sort, enabled) VALUES(?,?,1)');
    cats.forEach((name, i) => insCat.run(name, (i + 1) * 10));

    // 默认系统配置
    setConfig('ai_base_url', process.env.AI_BASE_URL || 'https://api.openai.com/v1');
    setConfig('ai_api_key', process.env.AI_API_KEY || '');
    setConfig('ai_model', process.env.AI_MODEL || 'gpt-4o-mini');
    setConfig('confidence_threshold', process.env.AI_CONFIDENCE_THRESHOLD || '0.7');
  });
  tx();
  console.log('[seed] 完成。演示账号：admin/admin123, teacher01/teacher123, student01/student123');
}

seed();

module.exports = { db, getConfig, setConfig };
