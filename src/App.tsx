import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import LoginPage from './pages/LoginPage';
import GetAppPage from './pages/GetAppPage';
import LookupPage from './pages/LookupPage';
import PlatformAdminPage from './pages/PlatformAdminPage';
import AccessControlPage from './pages/AccessControlPage';
import NotFoundPage from './pages/NotFoundPage';
import OwnerDashboard from './pages/dashboards/OwnerDashboard';
import TechnicianDashboard from './pages/dashboards/TechnicianDashboard';
import AdminDashboard from './pages/dashboards/AdminDashboard';
import CustomerDashboard from './pages/dashboards/CustomerDashboard';
import ManagerDashboard from './pages/dashboards/ManagerDashboard';
import ReportsPage from './pages/ReportsPage';

function RootRedirect() {
  const { user, profile, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  const roleRoutes: Record<string, string> = {
    owner: '/dashboard/owner',
    technician: '/dashboard/technician',
    admin: '/dashboard/admin',
    customer: '/dashboard/customer',
    manager: '/dashboard/manager',
  };
  return <Navigate to={roleRoutes[profile?.role ?? 'customer']} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            {/* the install page is public — it is what a new phone opens first */}
            <Route path="/download" element={<GetAppPage />} />
            {/* Who is calling — opened from a saved phone contact, the phone
                system, or by typing a number. Every office role can use it. */}
            <Route
              path="/lookup"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'manager', 'technician']}>
                  <ErrorBoundary><LookupPage /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            {/* Ours: the companies on this deployment and what each one has. */}
            <Route
              path="/platform"
              element={
                <ProtectedRoute>
                  <ErrorBoundary><PlatformAdminPage /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            {/* Theirs: who inside the company may open what. */}
            <Route
              path="/access"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin', 'manager']}>
                  <ErrorBoundary><AccessControlPage /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route path="/install" element={<Navigate to="/download" replace />} />
            <Route path="/app" element={<Navigate to="/download" replace />} />
            <Route
              path="/dashboard/owner"
              element={
                <ProtectedRoute allowedRole="owner">
                  <ErrorBoundary><OwnerDashboard /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/owner/reports"
              element={
                <ProtectedRoute allowedRole="owner">
                  <ErrorBoundary><ReportsPage /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/technician"
              element={
                <ProtectedRoute allowedRole="technician">
                  <ErrorBoundary><TechnicianDashboard /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/admin"
              element={
                <ProtectedRoute allowedRole="admin">
                  <ErrorBoundary><AdminDashboard /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/customer"
              element={
                <ProtectedRoute allowedRole="customer">
                  <ErrorBoundary><CustomerDashboard /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/manager"
              element={
                <ProtectedRoute allowedRole="manager">
                  <ErrorBoundary><ManagerDashboard /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
