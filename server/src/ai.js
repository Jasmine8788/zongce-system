// AI 分类模块：优先调用大模型（OpenAI 兼容接口），失败或未配置 Key 时使用关键词规则兜底
const fs = require('fs');
const { getConfig } = require('./db');

// ---------- 文本抽取（PDF 尽力而为，失败不阻断流程；图片在无边距视觉模型时使用文件名+用户填写信息） ----------
async function extractText(filePath, mime) {
  if (mime === 'application/pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fs.readFileSync(filePath));
      return (data.text || '').replace(/\s+/g, ' ').slice(0, 4000);
    } catch (e) {
      console.warn('[ai] PDF 文本抽取失败：', e.message);
      return '';
    }
  }
  return '';
}

// ---------- 规则兜底分类 ----------
const RULE_KEYWORDS = [
  { name: '志愿服务', words: ['志愿', '义工', '支教', '公益', '服务时长', 'volunteer'] },
  { name: '科技创新', words: ['竞赛', '创新', '科技', '专利', '论文', '大创', '挑战杯', '数学建模', 'acm', '程序设计', '机器人', '科研', '蓝桥杯', '互联网+'] },
  { name: '文体活动', words: ['运动会', '篮球', '足球', '排球', '文艺', '演出', '歌唱', '舞蹈', '马拉松', '体育', '艺术节', '合唱', '辩论'] },
  { name: '社会实践', words: ['实践', '实习', '调研', '三下乡', '见习', '参观'] },
  { name: '学生工作', words: ['学生会', '班委', '班长', '社团', '干部', '主席', '部长', '团委', '干事'] },
  { name: '学业成绩', words: ['奖学金', '成绩', '绩点', '四级', '六级', '英语', '证书', '资格考试', '普通话', '计算机等级'] },
  { name: '思想品德', words: ['思想', '品德', '党课', '团课', '党校', '学习强国', '评优', '优秀团员', '德育'] },
];

function detectLevel(text) {
  if (/国家级|全国|国赛/.test(text)) return '国家级';
  if (/省级|省赛|全省/.test(text)) return '省级';
  if (/市级|市赛/.test(text)) return '市级';
  if (/校级|学校|大学(?!.*学院)/.test(text)) return '校级';
  if (/院级|学院|系里/.test(text)) return '院级';
  return '';
}

function detectAward(text) {
  const m = text.match(/(特等奖|一等奖|二等奖|三等奖|优秀奖|金奖|银奖|铜奖|冠军|亚军|季军)/);
  return m ? m[1] : '';
}

// 基于关键词的规则分类，命中越多置信度越高（封顶 0.65，保证低于默认阈值进入待确认）
function ruleClassify({ text, filename, activityName, categories }) {
  const haystack = `${filename} ${activityName} ${text}`.toLowerCase();
  let best = null;
  let bestHits = 0;
  for (const rule of RULE_KEYWORDS) {
    const cat = categories.find((c) => c.name === rule.name);
    if (!cat) continue;
    const hits = rule.words.reduce((n, w) => n + (haystack.includes(w.toLowerCase()) ? 1 : 0), 0);
    if (hits > bestHits) { best = cat; bestHits = hits; }
  }
  const fallback = categories.find((c) => c.name === '其他') || categories[categories.length - 1];
  const cat = best || fallback;
  return {
    categoryId: cat.id,
    categoryName: cat.name,
    activityName: activityName || filename.replace(/\.[^.]+$/, ''),
    activityTime: (haystack.match(/20\d{2}[-年./]\d{1,2}([-月./]\d{1,2})?/) || [])[0] || '',
    level: detectLevel(haystack),
    role: '',
    award: detectAward(haystack),
    tags: best ? RULE_KEYWORDS.find((r) => r.name === best.name).words.filter((w) => haystack.includes(w.toLowerCase())) : [],
    confidence: best ? Math.min(0.4 + bestHits * 0.1, 0.65) : 0.25,
    source: 'rule',
  };
}

// ---------- 大模型分类（OpenAI 兼容 /chat/completions） ----------
async function llmClassify({ text, filename, activityName, mime, filePath, categories }) {
  const cfg = getConfig();
  const catNames = categories.map((c) => c.name).join('、');

  const userText = [
    `文件名：${filename}`,
    activityName ? `学生填写的活动名称：${activityName}` : '',
    text ? `材料文本内容：${text}` : '',
  ].filter(Boolean).join('\n');

  const instruction = [
    '你是高校综合素质测评材料分类助手。请根据给定材料信息，完成：',
    `1) 从候选类别中选择最匹配的一个类别（候选：${catNames}）；`,
    '2) 抽取结构化字段：活动名称、活动时间、级别（国家级/省级/市级/校级/院级/无）、担任角色、获奖情况；',
    '3) 给出 2~5 个标签，以及 0~1 的分类置信度。',
    '仅输出 JSON，格式：{"category":"类别名","activity_name":"","activity_time":"","level":"","role":"","award":"","tags":[],"confidence":0.9}',
  ].join('\n');

  // 构造消息：图片材料附带 base64，供具备视觉能力的模型识别
  const content = [{ type: 'text', text: `${instruction}\n\n${userText}` }];
  if (mime.startsWith('image/')) {
    try {
      const b64 = fs.readFileSync(filePath).toString('base64');
      content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } });
    } catch { /* 读取失败则仅使用文本信息 */ }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`${cfg.ai_base_url.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.ai_api_key}` },
      body: JSON.stringify({
        model: cfg.ai_model,
        messages: [{ role: 'user', content }],
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`AI 接口返回 ${resp.status}`);
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const json = JSON.parse((raw.match(/\{[\s\S]*\}/) || [raw])[0]);

    const cat = categories.find((c) => c.name === json.category) || categories.find((c) => c.name === '其他') || categories[0];
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      activityName: json.activity_name || activityName || filename.replace(/\.[^.]+$/, ''),
      activityTime: json.activity_time || '',
      level: json.level || '',
      role: json.role || '',
      award: json.award || '',
      tags: Array.isArray(json.tags) ? json.tags.map(String) : [],
      confidence: Math.max(0, Math.min(1, Number(json.confidence) || 0.5)),
      source: 'ai',
      raw,
    };
  } finally {
    clearTimeout(timer);
  }
}

// 统一入口：有 Key 走大模型，失败自动降级为规则分类
async function classify(opts) {
  const cfg = getConfig();
  if (cfg.ai_api_key) {
    try {
      return await llmClassify(opts);
    } catch (e) {
      console.warn('[ai] 大模型分类失败，降级为规则分类：', e.message);
    }
  }
  return ruleClassify(opts);
}

module.exports = { extractText, classify };
