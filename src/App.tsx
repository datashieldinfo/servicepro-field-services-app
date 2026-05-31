import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import OwnerDashboard from './pages/dashboards/OwnerDashboard';
import TechnicianDashboard from './pages/dashboards/TechnicianDashboard';
import AdminDashboard from './pages/dashboards/AdminDashboard';
import CustomerDashboard from './pages/dashboards/CustomerDashboard';
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
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
