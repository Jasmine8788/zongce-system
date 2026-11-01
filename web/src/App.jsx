// 路由与角色守卫：按角色分发到三端
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import Login from './pages/Login';
import StudentApp from './pages/StudentApp';
import TeacherApp from './pages/TeacherApp';
import AdminApp from './pages/AdminApp';
import ChangePassword from './components/ChangePassword';

// 角色守卫 + 强制改密
function Guard({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  if (user.must_change_pwd) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm">
            您的密码由管理员分配，首次登录请先修改密码。
          </div>
          <ChangePassword forced />
        </div>
      </div>
    );
  }
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? `/${user.role}` : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/student" element={<Guard role="student"><StudentApp /></Guard>} />
      <Route path="/teacher" element={<Guard role="teacher"><TeacherApp /></Guard>} />
      <Route path="/admin" element={<Guard role="admin"><AdminApp /></Guard>} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
