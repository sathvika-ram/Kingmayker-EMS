import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import CoordinatorDashboard from './pages/CoordinatorDashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import LeaderDashboard from './pages/LeaderDashboard';
import { AuthProvider, useAuth } from './context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  
  return children;
};

const DefaultRedirect = () => {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'super_admin') return <Navigate to="/admin/analytics" replace />;
  if (user.role === 'party_leader') return <Navigate to="/leader" replace />;
  if (user.role === 'constituency_coordinator') return <Navigate to="/coordinator" replace />;
  
  return <Navigate to="/login" replace />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DefaultRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<Navigate to="/admin/analytics" replace />} />
          <Route 
            path="/coordinator/*" 
            element={
              <ProtectedRoute allowedRoles={['constituency_coordinator']}>
                <CoordinatorDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/*" 
            element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <SuperAdminDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/leader/*" 
            element={
              <ProtectedRoute allowedRoles={['party_leader']}>
                <LeaderDashboard />
              </ProtectedRoute>
            } 
          />
          <Route path="*" element={<DefaultRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
