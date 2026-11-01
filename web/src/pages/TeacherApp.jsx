// 老师端：数据总览 / 材料审核 / 班级导出 / 修改密码
import { useEffect, useState } from 'react';
import { api, errMsg, fileUrl } from '../api';
import { Shell, Card, StatusBadge, ConfidenceBadge, BarList } from '../components/UI';
import ChangePassword from '../components/ChangePassword';

const input = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';

export default function TeacherApp() {
  const [tab, setTab] = useState('dashboard');
  const tabs = [
    { key: 'dashboard', label: '数据总览' },
    { key: 'review', label: '材料审核' },
    { key: 'export', label: '导出汇总' },
    { key: 'password', label: '修改密码' },
  ];
  return (
    <Shell tabs={tabs} tab={tab} setTab={setTab}>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'review' && <Review />}
      {tab === 'export' && <ExportPanel />}
      {tab === 'password' && <ChangePassword />}
    </Shell>
  );
}

// ---------- 数据总览 ----------
function Dashboard() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get('/teacher/stats').then(({ data }) => setStats(data)).catch((e) => alert(errMsg(e))); }, []);
  if (!stats) return <Card>加载中...</Card>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="text-center"><div className="text-2xl font-bold text-indigo-600">{stats.total}</div><div className="text-xs text-gray-500 mt-1">材料总数</div></Card>
        <Card className="text-center"><div className="text-2xl font-bold text-amber-500">{stats.pending}</div><div className="text-xs text-gray-500 mt-1">待确认/待审核</div></Card>
        <Card className="text-center"><div className="text-2xl font-bold text-green-600">{stats.byStudent.length}</div><div className="text-xs text-gray-500 mt-1">有材料的学生</div></Card>
        <Card className="text-center"><div className="text-2xl font-bold text-purple-600">{(stats.corrections || []).length}</div><div className="text-xs text-gray-500 mt-1">近期纠错记录</div></Card>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card title="按综测类别统计"><BarList data={stats.byCategory} /></Card>
        <Card title="按活动级别统计"><BarList data={stats.byLevel} color="bg-purple-500" /></Card>
      </div>

      <Card title="学生材料汇总">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-4">学号</th><th className="py-2 pr-4">姓名</th><th className="py-2 pr-4">材料数</th>
              <th className="py-2 pr-4">待确认</th><th className="py-2 pr-4">已确认</th><th className="py-2">已驳回</th>
            </tr></thead>
            <tbody>
              {stats.byStudent.map((s) => (
                <tr key={s.username} className="border-b last:border-0">
                  <td className="py-2 pr-4">{s.username}</td><td className="py-2 pr-4">{s.name}</td>
                  <td className="py-2 pr-4">{s.count}</td>
                  <td className="py-2 pr-4 text-amber-600">{s.pending}</td>
                  <td className="py-2 pr-4 text-green-600">{s.confirmed}</td>
                  <td className="py-2 text-red-500">{s.rejected}</td>
                </tr>
              ))}
              {stats.byStudent.length === 0 && <tr><td colSpan="6" className="py-6 text-center text-gray-400">暂无数据</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="最近纠错记录（学生修正 AI 分类）">
        <div className="space-y-1 text-sm">
          {(stats.corrections || []).map((c) => (
            <div key={c.id} className="text-gray-600">
              <span className="text-gray-400">{c.created_at}</span>　{c.student_name} 将「{c.activity_name || `#${c.material_id}`}」从
              <span className="text-red-500 mx-1">{c.old_category || '未分类'}</span>改为
              <span className="text-green-600 mx-1">{c.new_category}</span>
            </div>
          ))}
          {(stats.corrections || []).length === 0 && <div className="text-gray-400">暂无纠错记录</div>}
        </div>
      </Card>
    </div>
  );
}

// ---------- 材料审核 ----------
function Review() {
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ class_id: '', status: '', category_id: '', q: '' });

  const load = async () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const { data } = await api.get('/teacher/materials', { params });
    setItems(data.items);
  };

  useEffect(() => {
    api.get('/teacher/classes').then(({ data }) => setClasses(data.classes)).catch(() => {});
    api.get('/categories').then(({ data }) => setCategories(data.items)).catch(() => {});
  }, []);
  useEffect(() => { load().catch((e) => alert(errMsg(e))); }, [filters.class_id, filters.status, filters.category_id]);

  const review = async (m, status) => {
    let note = '';
    if (status === 'rejected') {
      note = prompt('请输入驳回备注（可选）');
      if (note === null) return; // 取消则不提交
    }
    try {
      await api.post(`/teacher/materials/${m.id}/review`, { status, note });
      load();
    } catch (e) { alert(errMsg(e)); }
  };

  return (
    <Card title="所辖学生材料审核">
      <div className="flex flex-wrap gap-2 mb-4">
        <select className={input} value={filters.class_id} onChange={(e) => setFilters({ ...filters, class_id: e.target.value })}>
          <option value="">全部班级</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={input} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">全部状态</option>
          <option value="pending">待确认</option>
          <option value="confirmed">已确认</option>
          <option value="rejected">已驳回</option>
        </select>
        <select className={input} value={filters.category_id} onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}>
          <option value="">全部类别</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className={input} placeholder="搜索活动 / 学生姓名" value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button onClick={load} className="rounded-lg bg-gray-100 px-4 text-sm hover:bg-gray-200">搜索</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-3">学生</th><th className="py-2 pr-3">班级</th><th className="py-2 pr-3">活动</th>
            <th className="py-2 pr-3">类别</th><th className="py-2 pr-3">级别</th><th className="py-2 pr-3">AI</th>
            <th className="py-2 pr-3">状态</th><th className="py-2 pr-3">证明</th><th className="py-2">操作</th>
          </tr></thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-b last:border-0 align-top">
                <td className="py-2 pr-3">{m.student_name}<div className="text-xs text-gray-400">{m.username}</div></td>
                <td className="py-2 pr-3">{m.class_name}</td>
                <td className="py-2 pr-3">{m.activity_name || '-'}<div className="text-xs text-gray-400">{m.activity_time}</div></td>
                <td className="py-2 pr-3">{m.category_name || '未分类'}</td>
                <td className="py-2 pr-3">{m.level || '-'}</td>
                <td className="py-2 pr-3"><ConfidenceBadge value={m.ai_confidence} source={m.ai_source} /></td>
                <td className="py-2 pr-3"><StatusBadge status={m.status} />
                  {m.review_note && <div className="text-xs text-red-400">{m.review_note}</div>}</td>
                <td className="py-2 pr-3"><a href={fileUrl(m.file_url)} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline text-xs">查看</a></td>
                <td className="py-2 space-x-2 whitespace-nowrap">
                  <button onClick={() => review(m, 'confirmed')} className="text-xs text-green-600 hover:underline">通过</button>
                  <button onClick={() => review(m, 'rejected')} className="text-xs text-red-500 hover:underline">驳回</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="9" className="py-6 text-center text-gray-400">暂无材料</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- 导出 ----------
function ExportPanel() {
  const download = async () => {
    try {
      const resp = await api.get('/teacher/export', { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(resp.data);
      a.download = '班级综测材料汇总.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { alert(errMsg(e)); }
  };
  return (
    <Card title="导出班级汇总表">
      <p className="text-sm text-gray-500 mb-4">导出所辖全部学生的材料明细（CSV 格式，Excel 可直接打开）。</p>
      <button onClick={download} className="rounded-lg bg-green-600 text-white px-5 py-2.5 text-sm hover:bg-green-500">
        下载班级汇总 CSV
      </button>
    </Card>
  );
}
