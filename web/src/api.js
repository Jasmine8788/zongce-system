// 统一 API 客户端：baseURL 来自环境变量 VITE_API_BASE_URL，自动携带 JWT
import axios from 'axios';

const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export const api = axios.create({ baseURL: `${base}/api` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (resp) => resp,
  (err) => {
    // 登录失效统一跳回登录页
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!location.hash.includes('/login')) location.hash = '#/login';
    }
    return Promise.reject(err);
  }
);

// 拼接可公网访问的文件 URL（上传材料预览用）
export const fileUrl = (p) => `${base}${p}`;

// 错误信息提取
export const errMsg = (e) => e.response?.data?.error || e.message || '操作失败';

// 前端生成并下载 CSV（带 BOM，Excel 兼容中文）
export function downloadCSV(filename, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
