// 修改密码（学生/老师/管理员共用，forced 表示管理员分配后强制修改）
import { useState } from 'react';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';
import { Card } from './UI';

export default function ChangePassword({ forced = false }) {
  const { updateUser } = useAuth();
  const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(''); setErr('');
    if (form.newPassword !== form.confirm) return setErr('两次输入的新密码不一致');
    if (form.newPassword.length < 6 || !/[A-Za-z]/.test(form.newPassword) || !/\d/.test(form.newPassword)) {
      return setErr('新密码至少 6 位，且需同时包含字母和数字');
    }
    setLoading(true);
    try {
      await api.post('/auth/change-password', { oldPassword: form.oldPassword, newPassword: form.newPassword });
      updateUser({ must_change_pwd: false });
      setMsg('密码修改成功');
      setForm({ oldPassword: '', newPassword: '', confirm: '' });
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setLoading(false);
    }
  };

  const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <Card title={forced ? '设置新密码' : '修改密码'}>
      <form onSubmit={submit} className="space-y-3 max-w-sm">
        <div>
          <label className="text-sm text-gray-600">原密码</label>
          <input type="password" className={input} value={form.oldPassword}
            onChange={(e) => setForm({ ...form, oldPassword: e.target.value })} required />
        </div>
        <div>
          <label className="text-sm text-gray-600">新密码</label>
          <input type="password" className={input} value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required
            placeholder="至少 6 位，包含字母和数字" />
        </div>
        <div>
          <label className="text-sm text-gray-600">确认新密码</label>
          <input type="password" className={input} value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        {msg && <div className="text-sm text-green-600">{msg}</div>}
        <button disabled={loading} className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-500 disabled:opacity-50">
          {loading ? '提交中...' : '确认修改'}
        </button>
      </form>
    </Card>
  );
}
