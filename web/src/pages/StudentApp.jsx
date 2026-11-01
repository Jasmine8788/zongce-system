// 学生端：上传材料 / 我的材料（筛选、纠错、重分类、删除）/ 综测填报导出 / 修改密码
import { useEffect, useMemo, useState } from 'react';
import { api, errMsg, fileUrl, downloadCSV } from '../api';
import { Shell, Card, StatusBadge, ConfidenceBadge } from '../components/UI';
import ChangePassword from '../components/ChangePassword';

const LEVELS = ['', '国家级', '省级', '市级', '校级', '院级'];
const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';

export default function StudentApp() {
  const [tab, setTab] = useState('upload');
  const [refreshFlag, setRefreshFlag] = useState(0);
  const tabs = [
    { key: 'upload', label: '上传材料' },
    { key: 'materials', label: '我的材料' },
    { key: 'export', label: '综测填报导出' },
    { key: 'password', label: '修改密码' },
  ];
  return (
    <Shell tabs={tabs} tab={tab} setTab={setTab}>
      {tab === 'upload' && <Upload onDone={() => { setRefreshFlag((f) => f + 1); setTab('materials'); }} />}
      {tab === 'materials' && <Materials refreshFlag={refreshFlag} />}
      {tab === 'export' && <ExportView />}
      {tab === 'password' && <ChangePassword />}
    </Shell>
  );
}

// ---------- 上传 ----------
function Upload({ onDone }) {
  const [files, setFiles] = useState([]);
  const [meta, setMeta] = useState({ activity_name: '', activity_time: '', organizer: '' });
  const [results, setResults] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (files.length === 0) return setErr('请先选择文件（jpg / png / pdf）');
    setErr(''); setLoading(true); setResults(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      fd.append('activity_name', meta.activity_name);
      fd.append('activity_time', meta.activity_time);
      fd.append('organizer', meta.organizer);
      const { data } = await api.post('/materials', fd);
      setResults(data.items);
      setFiles([]);
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card title="上传活动证明材料">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-gray-600">活动名称（可选，AI 可补全）</label>
              <input className={input} value={meta.activity_name}
                onChange={(e) => setMeta({ ...meta, activity_name: e.target.value })} placeholder="如：全国大学生数学建模竞赛" />
            </div>
            <div>
              <label className="text-sm text-gray-600">活动时间（可选）</label>
              <input className={input} type="date" value={meta.activity_time}
                onChange={(e) => setMeta({ ...meta, activity_time: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-gray-600">主办方（可选）</label>
              <input className={input} value={meta.organizer}
                onChange={(e) => setMeta({ ...meta, organizer: e.target.value })} placeholder="如：校团委" />
            </div>
          </div>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-300 rounded-xl py-10 cursor-pointer hover:bg-indigo-50 transition">
            {/* accept 限定图片/PDF，移动端自动唤起拍照/相册 */}
            <input type="file" multiple accept="image/jpeg,image/png,application/pdf" className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files || []))} />
            <div className="text-indigo-600 font-medium">点击选择文件 / 手机拍照上传</div>
            <div className="text-xs text-gray-400 mt-1">支持 jpg、png、pdf，单个不超过 10MB，一次最多 9 个</div>
            {files.length > 0 && (
              <div className="mt-3 text-sm text-gray-700">已选 {files.length} 个：{files.map((f) => f.name).join('、')}</div>
            )}
          </label>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button disabled={loading}
            className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50">
            {loading ? '上传并 AI 识别中...' : '上传并自动分类'}
          </button>
        </form>
      </Card>

      {results && (
        <Card title="AI 识别结果">
          <div className="space-y-3">
            {results.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 p-3 text-sm">
                <a className="text-indigo-600 hover:underline" href={fileUrl(m.file_url)} target="_blank" rel="noreferrer">{m.original_name}</a>
                <span className="text-gray-500">→</span>
                <span className="font-medium">{m.activity_name || '（未命名）'}</span>
                <span className="rounded bg-indigo-50 text-indigo-700 px-2 py-0.5 text-xs">{m.ai_source === 'rule' ? '规则分类' : 'AI 分类'}</span>
                <ConfidenceBadge value={m.ai_confidence} source={m.ai_source} />
                <StatusBadge status={m.status} />
                {m.status === 'pending' && <span className="text-xs text-amber-600">置信度较低，请在“我的材料”中确认或修正</span>}
              </div>
            ))}
            <button onClick={onDone} className="text-sm text-indigo-600 hover:underline">前往“我的材料”查看 →</button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------- 我的材料 ----------
function Materials({ refreshFlag }) {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ category_id: '', status: '', q: '' });
  const [editing, setEditing] = useState(null); // 正在编辑的材料对象

  const load = async () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const { data } = await api.get('/materials', { params });
    setItems(data.items);
  };

  useEffect(() => { api.get('/categories').then(({ data }) => setCategories(data.items)); }, []);
  useEffect(() => { load().catch((e) => alert(errMsg(e))); }, [refreshFlag, filters.category_id, filters.status]);

  const remove = async (id) => {
    if (!confirm('确定删除该材料及其证明文件吗？')) return;
    try { await api.delete(`/materials/${id}`); load(); } catch (e) { alert(errMsg(e)); }
  };

  const reclassify = async (id) => {
    try { await api.post(`/materials/${id}/reclassify`); load(); } catch (e) { alert(errMsg(e)); }
  };

  return (
    <Card title="我的材料库">
      <div className="flex flex-wrap gap-2 mb-4">
        <select className={`${input} !w-auto`} value={filters.category_id}
          onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}>
          <option value="">全部类别</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={`${input} !w-auto`} value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">全部状态</option>
          <option value="pending">待确认</option>
          <option value="confirmed">已确认</option>
          <option value="rejected">已驳回</option>
        </select>
        <input className={`${input} !w-52`} placeholder="搜索活动名 / 文件名" value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button onClick={load} className="rounded-lg bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200">搜索</button>
      </div>

      <div className="space-y-3">
        {items.map((m) => (
          <div key={m.id} className="rounded-lg border border-gray-100 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <a href={fileUrl(m.file_url)} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline text-sm font-medium">{m.original_name}</a>
              <StatusBadge status={m.status} />
              <span className="rounded bg-gray-100 text-gray-600 px-2 py-0.5 text-xs">{m.category_name || '未分类'}</span>
              <ConfidenceBadge value={m.ai_confidence} source={m.ai_source} />
              {m.review_note && <span className="text-xs text-red-500">老师备注：{m.review_note}</span>}
              <span className="ml-auto flex gap-2">
                <button onClick={() => setEditing({ ...m, tags: undefined })} className="text-xs text-indigo-600 hover:underline">编辑/纠错</button>
                <button onClick={() => reclassify(m.id)} className="text-xs text-gray-500 hover:underline">重新分类</button>
                <button onClick={() => remove(m.id)} className="text-xs text-red-500 hover:underline">删除</button>
              </span>
            </div>
            <div className="mt-2 text-sm text-gray-600 grid sm:grid-cols-4 gap-1">
              <span>活动：{m.activity_name || '-'}</span>
              <span>时间：{m.activity_time || '-'}</span>
              <span>级别：{m.level || '-'}</span>
              <span>获奖：{m.award || '-'}</span>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-center text-gray-400 py-8 text-sm">暂无材料，先去“上传材料”吧</div>}
      </div>

      {editing && (
        <EditModal material={editing} categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}
    </Card>
  );
}

// 编辑/纠错弹窗（类别变更会记录纠错日志）
function EditModal({ material, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    activity_name: material.activity_name || '', activity_time: material.activity_time || '',
    organizer: material.organizer || '', level: material.level || '',
    role_in_activity: material.role_in_activity || '', award: material.award || '',
    category_id: material.category_id || '',
  });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      await api.put(`/materials/${material.id}`, form);
      onSaved();
    } catch (e2) { setErr(errMsg(e2)); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">编辑 / 纠错材料</h3>
        <form onSubmit={save} className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm">活动名称
            <input className={input} value={form.activity_name} onChange={(e) => setForm({ ...form, activity_name: e.target.value })} /></label>
          <label className="text-sm">活动时间
            <input className={input} value={form.activity_time} onChange={(e) => setForm({ ...form, activity_time: e.target.value })} /></label>
          <label className="text-sm">主办方
            <input className={input} value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })} /></label>
          <label className="text-sm">级别
            <select className={input} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
              {LEVELS.map((l) => <option key={l} value={l}>{l || '（无）'}</option>)}
            </select></label>
          <label className="text-sm">担任角色
            <input className={input} value={form.role_in_activity} onChange={(e) => setForm({ ...form, role_in_activity: e.target.value })} /></label>
          <label className="text-sm">获奖情况
            <input className={input} value={form.award} onChange={(e) => setForm({ ...form, award: e.target.value })} /></label>
          <label className="text-sm">综测类别（修正后记录纠错日志）
            <select className={input} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
          {err && <div className="col-span-2 text-sm text-red-600">{err}</div>}
          <div className="col-span-2 flex justify-end gap-2 mt-1">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">取消</button>
            <button disabled={loading} className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm disabled:opacity-50">
              {loading ? '保存中...' : '保存并确认'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- 综测填报导出 ----------
function ExportView() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get('/materials').then(({ data }) => setItems(data.items.filter((m) => m.status !== 'rejected'))).catch((e) => alert(errMsg(e))); }, []);

  const grouped = useMemo(() => {
    const map = {};
    for (const m of items) {
      const key = m.category_name || '未分类';
      (map[key] = map[key] || []).push(m);
    }
    return Object.entries(map);
  }, [items]);

  const lineOf = (m) =>
    `${m.activity_name || m.original_name}${m.activity_time ? `（${m.activity_time}）` : ''}${m.level ? `，${m.level}` : ''}${m.award ? `，${m.award}` : ''}${m.review_note ? `，备注：${m.review_note}` : ''}`;

  const exportExcel = () => {
    const rows = [['类别', '活动名称', '活动时间', '级别', '角色', '获奖情况', '证明材料', '状态']];
    const statusMap = { pending: '待确认', confirmed: '已确认' };
    for (const [cat, list] of grouped) {
      for (const m of list) {
        rows.push([cat, m.activity_name, m.activity_time, m.level, m.role_in_activity, m.award, m.original_name, statusMap[m.status] || m.status]);
      }
    }
    downloadCSV('综测填报清单.csv', rows);
  };

  const copyText = async () => {
    const text = grouped.map(([cat, list]) =>
      `【${cat}】\n${list.map((m, i) => `${i + 1}. ${lineOf(m)}`).join('\n')}`
    ).join('\n\n');
    await navigator.clipboard.writeText(text);
    alert('已复制填报清单文本，可直接粘贴到综测系统');
  };

  // 打印（浏览器可另存为 PDF）
  const printPdf = () => {
    const html = `<html><head><meta charset="utf-8"><title>综测填报清单</title>
      <style>body{font-family:system-ui;padding:32px;color:#222}h1{font-size:20px}h2{font-size:16px;margin-top:24px;border-bottom:1px solid #ddd;padding-bottom:4px}li{margin:6px 0;font-size:14px}.file{color:#888;font-size:12px}</style></head><body>
      <h1>综合素质测评填报清单</h1>
      ${grouped.map(([cat, list]) => `<h2>${cat}（${list.length} 项）</h2><ol>${list.map((m) => `<li>${lineOf(m)} <span class="file">[证明材料：${m.original_name}]</span></li>`).join('')}</ol>`).join('')}
      </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Card title="综测填报清单（按类别自动汇总，已驳回的不纳入）">
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={exportExcel} className="rounded-lg bg-green-600 text-white px-4 py-2 text-sm hover:bg-green-500">导出 Excel（CSV）</button>
        <button onClick={printPdf} className="rounded-lg bg-red-500 text-white px-4 py-2 text-sm hover:bg-red-400">打印 / 另存为 PDF</button>
        <button onClick={copyText} className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-500">一键复制文本</button>
      </div>
      <div className="space-y-6">
        {grouped.map(([cat, list]) => (
          <div key={cat}>
            <h4 className="font-medium text-indigo-700 border-b pb-1 mb-2">{cat}（{list.length} 项）</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
              {list.map((m) => (
                <li key={m.id}>
                  {lineOf(m)}
                  <a href={fileUrl(m.file_url)} target="_blank" rel="noreferrer" className="ml-2 text-xs text-indigo-500 hover:underline">[证明材料]</a>
                </li>
              ))}
            </ol>
          </div>
        ))}
        {grouped.length === 0 && <div className="text-center text-gray-400 py-8 text-sm">暂无可汇总材料</div>}
      </div>
    </Card>
  );
}
