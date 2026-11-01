// 登录页：含演示账号提示与一键填充
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { errMsg } from '../api';

const DEMO_ACCOUNTS = [
  { label: '管理员', username: 'admin', password: 'admin123' },
  { label: '老师-计算机2301班', username: 'teacher01', password: 'teacher123' },
  { label: '老师-计算机2302班', username: 'teacher02', password: 'teacher123' },
  { label: '学生-王明', username: 'student01', password: 'student123' },
  { label: '学生-赵雪', username: 'student04', password: 'student123' },
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const user = await login(form.username, form.password);
      nav(`/${user.role}`);
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setLoading(false);
    }
  };

  const input = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-2xl font-bold text-center text-gray-800">综测材料归集系统</h1>
          <p className="text-center text-sm text-gray-500 mt-1 mb-6">平时沉淀材料 · 填报一键生成</p>
          <form onSubmit={submit} className="space-y-4">
            <input className={input} placeholder="用户名" value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            <input className={input} type="password" placeholder="密码" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            {err && <div className="text-sm text-red-600">{err}</div>}
            <button disabled={loading}
              className="w-full rounded-lg bg-indigo-600 text-white py-2.5 font-medium hover:bg-indigo-500 disabled:opacity-50">
              {loading ? '登录中...' : '登 录'}
            </button>
          </form>
        </div>
        <div className="mt-4 bg-white/90 rounded-xl p-4">
          <div className="text-xs font-medium text-gray-500 mb-2">演示账号（点击自动填充）</div>
          <div className="flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.username} onClick={() => setForm({ username: a.username, password: a.password })}
                className="text-xs rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 px-3 py-1 hover:bg-indigo-100">
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
