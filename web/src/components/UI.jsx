// 通用小组件：布局外壳、徽章、统计条
import { useAuth } from '../auth';

const roleName = { student: '学生端', teacher: '老师端', admin: '管理员端' };

export function Shell({ title, tabs, tab, setTab, children }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="bg-indigo-600 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-bold text-lg">综测材料归集系统 · {roleName[user.role]}</div>
          <div className="flex items-center gap-3 text-sm">
            <span>{user.name}（{user.username}）</span>
            <button onClick={logout} className="rounded bg-indigo-500 hover:bg-indigo-400 px-3 py-1">退出</button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm rounded-t-lg whitespace-nowrap ${tab === t.key ? 'bg-gray-50 text-indigo-700 font-medium' : 'text-indigo-100 hover:bg-indigo-500'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

export function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 ${className}`}>
      {title && <h3 className="font-semibold mb-4">{title}</h3>}
      {children}
    </div>
  );
}

const badgeColor = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};
const statusText = { pending: '待确认', confirmed: '已确认', rejected: '已驳回' };

export function StatusBadge({ status }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${badgeColor[status]}`}>{statusText[status]}</span>;
}

export function ConfidenceBadge({ value, source }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? 'text-green-600' : pct >= 45 ? 'text-amber-600' : 'text-red-500';
  return <span className={`text-xs ${color}`}>置信度 {pct}%{source === 'rule' ? '（规则）' : ''}</span>;
}

// 简单横向条形统计图
export function BarList({ data, color = 'bg-indigo-500' }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.name} className="flex items-center gap-2 text-sm">
          <div className="w-24 shrink-0 text-right text-gray-600">{d.name}</div>
          <div className="flex-1 bg-gray-100 rounded h-5">
            <div className={`${color} h-5 rounded`} style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
          <div className="w-10 text-gray-700">{d.count}</div>
        </div>
      ))}
      {data.length === 0 && <div className="text-sm text-gray-400">暂无数据</div>}
    </div>
  );
}
