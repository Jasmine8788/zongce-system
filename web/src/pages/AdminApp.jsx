// 管理员端：账号管理 / 班级管理 / 类别字典 / 系统配置 / 全局看板 / 修改密码
import { useEffect, useState } from 'react';
import { api, errMsg, downloadCSV } from '../api';
import { Shell, Card, BarList } from '../components/UI';
import ChangePassword from '../components/ChangePassword';

const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';
const btn = 'rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-500 disabled:opacity-50';

export default function AdminApp() {
  const [tab, setTab] = useState('users');
  const tabs = [
    { key: 'users', label: '账号管理' },
    { key: 'classes', label: '班级管理' },
    { key: 'categories', label: '类别字典' },
    { key: 'config', label: '系统配置' },
    { key: 'dashboard', label: '全局看板' },
    { key: 'password', label: '修改密码' },
  ];
  return (
    <Shell tabs={tabs} tab={tab} setTab={setTab}>
      {tab === 'users' && <Users />}
      {tab === 'classes' && <Classes />}
      {tab === 'categories' && <Categories />}
      {tab === 'config' && <Config />}
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'password' && <ChangePassword />}
    </Shell>
  );
}

// ---------- 账号管理 ----------
function Users() {
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [createForm, setCreateForm] = useState({ username: '', name: '', role: 'student', class_id: '', password: '' });
  const [created, setCreated] = useState(null); // 新创建账号的初始密码
  const [batchText, setBatchText] = useState('');
  const [batchResult, setBatchResult] = useState(null);

  const load = () => api.get('/admin/users').then(({ data }) => setUsers(data.items)).catch((e) => alert(errMsg(e)));
  useEffect(() => {
    load();
    api.get('/admin/classes').then(({ data }) => setClasses(data.items)).catch(() => {});
  }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/admin/users', { ...createForm, class_id: createForm.class_id || null });
      setCreated(data);
      setCreateForm({ username: '', name: '', role: 'student', class_id: '', password: '' });
      load();
    } catch (e2) { alert(errMsg(e2)); }
  };

  const batchCreate = async () => {
    if (!batchText.trim()) return alert('请先粘贴账号数据');
    try {
      const { data } = await api.post('/admin/users/batch', { text: batchText });
      setBatchResult(data.results);
      load();
    } catch (e) { alert(errMsg(e)); }
  };

  const downloadBatchCSV = () => {
    const ok = batchResult.filter((r) => r.ok);
    downloadCSV('新建账号初始密码.csv', [['用户名', '姓名', '班级', '角色', '初始密码'],
      ...ok.map((r) => [r.username, r.name, r.class, r.role, r.password])]);
  };

  const toggle = async (u) => {
    try {
      await api.put(`/admin/users/${u.id}`, { status: u.status === 'active' ? 'disabled' : 'active' });
      load();
    } catch (e) { alert(errMsg(e)); }
  };

  const resetPwd = async (u) => {
    if (!confirm(`确定重置 ${u.name}（${u.username}）的密码吗？`)) return;
    try {
      const { data } = await api.post(`/admin/users/${u.id}/reset-password`);
      alert(`新密码：${data.password}\n请通过安全渠道告知用户，首次登录后需修改。`);
    } catch (e) { alert(errMsg(e)); }
  };

  const assignClass = async (u, class_id) => {
    try { await api.put(`/admin/users/${u.id}`, { class_id: class_id || null }); load(); } catch (e) { alert(errMsg(e)); }
  };

  const exportUsers = async () => {
    const resp = await api.get('/admin/users-export', { responseType: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(resp.data);
    a.download = '账号清单.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const roleText = { student: '学生', teacher: '老师', admin: '管理员' };

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="单个创建账号">
          <form onSubmit={create} className="grid grid-cols-2 gap-3">
            <input className={input} placeholder="用户名（学号/工号）" value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} required />
            <input className={input} placeholder="姓名" value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} required />
            <select className={input} value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
              <option value="student">学生</option><option value="teacher">老师</option><option value="admin">管理员</option>
            </select>
            {createForm.role === 'student' && (
              <select className={input} value={createForm.class_id} onChange={(e) => setCreateForm({ ...createForm, class_id: e.target.value })} required>
                <option value="">选择班级</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <input className={`${input} col-span-2`} placeholder="初始密码（留空自动生成）" value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
            <button className={`${btn} col-span-2`}>创建账号</button>
          </form>
          {created && (
            <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">
              创建成功：{created.username}，初始密码 <b>{created.password}</b>（首次登录需修改）
            </div>
          )}
        </Card>

        <Card title="批量创建（每行：用户名,姓名,班级名[,角色]）">
          <textarea className={`${input} h-32 font-mono`} placeholder={'student06,钱进,计算机2301班\nstudent07,周舟,计算机2302班\nteacher03,吴老师,,teacher'}
            value={batchText} onChange={(e) => setBatchText(e.target.value)} />
          <div className="flex gap-2 mt-3">
            <button onClick={batchCreate} className={btn}>批量创建</button>
            {batchResult?.some((r) => r.ok) && (
              <button onClick={downloadBatchCSV} className="rounded-lg bg-green-600 text-white px-4 py-2 text-sm hover:bg-green-500">
                下载初始密码 CSV
              </button>
            )}
          </div>
          {batchResult && (
            <div className="mt-3 max-h-40 overflow-auto text-sm space-y-1">
              {batchResult.map((r, i) => (
                <div key={i} className={r.ok ? 'text-green-700' : 'text-red-600'}>
                  {r.ok ? `✓ ${r.username}（${r.name}）初始密码：${r.password}` : `✗ ${r.username}：${r.error}`}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title={<div className="flex items-center justify-between">全部账号
        <button onClick={exportUsers} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs hover:bg-gray-200">导出账号清单</button></div>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-3">用户名</th><th className="py-2 pr-3">姓名</th><th className="py-2 pr-3">角色</th>
              <th className="py-2 pr-3">班级</th><th className="py-2 pr-3">状态</th><th className="py-2">操作</th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">{u.username}</td>
                  <td className="py-2 pr-3">{u.name}</td>
                  <td className="py-2 pr-3">{roleText[u.role]}</td>
                  <td className="py-2 pr-3">
                    {u.role === 'student' ? (
                      <select className="border rounded px-2 py-1 text-xs" value={u.class_id || ''}
                        onChange={(e) => assignClass(u, e.target.value)}>
                        <option value="">未分配</option>
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : '-'}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                      {u.status === 'active' ? '启用' : '禁用'}
                    </span>
                    {!!u.must_change_pwd && <span className="ml-1 text-xs text-amber-500">待改密</span>}
                  </td>
                  <td className="py-2 space-x-2">
                    <button onClick={() => resetPwd(u)} className="text-xs text-indigo-600 hover:underline">重置密码</button>
                    <button onClick={() => toggle(u)} className="text-xs text-gray-500 hover:underline">
                      {u.status === 'active' ? '禁用' : '启用'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ---------- 班级管理 ----------
function Classes() {
  const [items, setItems] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [name, setName] = useState('');

  const load = () => {
    api.get('/admin/classes').then(({ data }) => setItems(data.items)).catch((e) => alert(errMsg(e)));
    api.get('/admin/users').then(({ data }) => setTeachers(data.items.filter((u) => u.role === 'teacher'))).catch(() => {});
  };
  useEffect(load, []);

  const add = async (e) => {
    e.preventDefault();
    try { await api.post('/admin/classes', { name }); setName(''); load(); } catch (e2) { alert(errMsg(e2)); }
  };
  const assignTeacher = async (c, teacher_id) => {
    try { await api.put(`/admin/classes/${c.id}`, { teacher_id: teacher_id || null }); load(); } catch (e) { alert(errMsg(e)); }
  };
  const remove = async (c) => {
    if (!confirm(`确定删除班级「${c.name}」吗？`)) return;
    try { await api.delete(`/admin/classes/${c.id}`); load(); } catch (e) { alert(errMsg(e)); }
  };

  return (
    <Card title="班级管理">
      <form onSubmit={add} className="flex gap-2 mb-4 max-w-md">
        <input className={input} placeholder="新班级名称，如：计算机2303班" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className={btn}>添加</button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-3">班级</th><th className="py-2 pr-3">班主任</th><th className="py-2 pr-3">学生数</th><th className="py-2">操作</th>
          </tr></thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="py-2 pr-3 font-medium">{c.name}</td>
                <td className="py-2 pr-3">
                  <select className="border rounded px-2 py-1 text-xs" value={c.teacher_id || ''}
                    onChange={(e) => assignTeacher(c, e.target.value)}>
                    <option value="">未分配</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}（{t.username}）</option>)}
                  </select>
                </td>
                <td className="py-2 pr-3">{c.student_count}</td>
                <td className="py-2"><button onClick={() => remove(c)} className="text-xs text-red-500 hover:underline">删除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- 类别字典 ----------
function Categories() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const load = () => api.get('/admin/categories').then(({ data }) => setItems(data.items)).catch((e) => alert(errMsg(e)));
  useEffect(load, []);

  const add = async (e) => {
    e.preventDefault();
    try { await api.post('/admin/categories', { name, sort: (items.length + 1) * 10 }); setName(''); load(); } catch (e2) { alert(errMsg(e2)); }
  };
  const toggle = async (c) => {
    try { await api.put(`/admin/categories/${c.id}`, { enabled: c.enabled ? 0 : 1 }); load(); } catch (e) { alert(errMsg(e)); }
  };
  const rename = async (c) => {
    const name = prompt('新的类别名称', c.name);
    if (!name) return;
    try { await api.put(`/admin/categories/${c.id}`, { name }); load(); } catch (e) { alert(errMsg(e)); }
  };
  const remove = async (c) => {
    if (!confirm(`确定删除类别「${c.name}」吗？`)) return;
    try { await api.delete(`/admin/categories/${c.id}`); load(); } catch (e) { alert(errMsg(e)); }
  };

  return (
    <Card title="综测类别字典（影响 AI 分类候选集）">
      <form onSubmit={add} className="flex gap-2 mb-4 max-w-md">
        <input className={input} placeholder="新类别名称" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className={btn}>添加</button>
      </form>
      <div className="space-y-2">
        {items.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-lg border border-gray-100 px-4 py-2 text-sm">
            <span className="w-8 text-gray-400">{c.sort}</span>
            <span className={c.enabled ? 'font-medium' : 'text-gray-400 line-through'}>{c.name}</span>
            <span className={`text-xs rounded-full px-2 py-0.5 ${c.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {c.enabled ? '启用' : '停用'}
            </span>
            <span className="ml-auto space-x-3">
              <button onClick={() => rename(c)} className="text-xs text-indigo-600 hover:underline">改名</button>
              <button onClick={() => toggle(c)} className="text-xs text-gray-500 hover:underline">{c.enabled ? '停用' : '启用'}</button>
              <button onClick={() => remove(c)} className="text-xs text-red-500 hover:underline">删除</button>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------- 系统配置 ----------
function Config() {
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.get('/admin/config').then(({ data }) => setCfg(data.config)).catch((e) => alert(errMsg(e))); }, []);
  if (!cfg) return <Card>加载中...</Card>;

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put('/admin/config', cfg);
      setMsg('已保存，新的分类任务立即生效');
    } catch (e2) { alert(errMsg(e2)); }
  };

  return (
    <Card title="AI 与系统配置">
      <form onSubmit={save} className="space-y-4 max-w-lg">
        <label className="block text-sm text-gray-600">AI 接口地址（OpenAI 兼容）
          <input className={input} value={cfg.ai_base_url} onChange={(e) => setCfg({ ...cfg, ai_base_url: e.target.value })}
            placeholder="https://api.openai.com/v1" /></label>
        <label className="block text-sm text-gray-600">API Key（留空则使用关键词规则兜底分类）
          <input className={input} type="password" value={cfg.ai_api_key} onChange={(e) => setCfg({ ...cfg, ai_api_key: e.target.value })}
            placeholder="sk-..." autoComplete="new-password" /></label>
        <label className="block text-sm text-gray-600">模型名（识别图片材料需使用视觉模型）
          <input className={input} value={cfg.ai_model} onChange={(e) => setCfg({ ...cfg, ai_model: e.target.value })}
            placeholder="gpt-4o-mini" /></label>
        <label className="block text-sm text-gray-600">置信度阈值（低于该值进入“待确认”，0~1）
          <input className={input} type="number" step="0.05" min="0" max="1" value={cfg.confidence_threshold}
            onChange={(e) => setCfg({ ...cfg, confidence_threshold: e.target.value })} /></label>
        {msg && <div className="text-sm text-green-600">{msg}</div>}
        <button className={btn}>保存配置</button>
      </form>
    </Card>
  );
}

// ---------- 全局看板 ----------
function Dashboard() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get('/admin/stats').then(({ data }) => setStats(data)).catch((e) => alert(errMsg(e))); }, []);
  if (!stats) return <Card>加载中...</Card>;
  const roleText = { student: '学生', teacher: '老师', admin: '管理员' };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="text-center"><div className="text-2xl font-bold text-indigo-600">{stats.total}</div><div className="text-xs text-gray-500 mt-1">材料总上传量</div></Card>
        <Card className="text-center"><div className="text-2xl font-bold text-amber-500">{stats.pending}</div><div className="text-xs text-gray-500 mt-1">待确认数量</div></Card>
        <Card className="text-center"><div className="text-2xl font-bold text-green-600">{stats.corrections}</div><div className="text-xs text-gray-500 mt-1">纠错总次数</div></Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-purple-600">{stats.usersByRole.reduce((n, r) => n + r.count, 0)}</div>
          <div className="text-xs text-gray-500 mt-1">用户总数（{stats.usersByRole.map((r) => `${roleText[r.role]}${r.count}`).join(' / ')}）</div>
        </Card>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Card title="材料分类分布"><BarList data={stats.byCategory} /></Card>
        <Card title="近 7 天上传量"><BarList data={stats.recent7} color="bg-green-500" /></Card>
      </div>
    </div>
  );
}
