import { Navigate } from 'react-router-dom';
import ChangePasswordGate from './ChangePasswordGate';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../lib/supabase';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole?: UserRole;
}

export function ProtectedRoute({ children, allowedRole }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // An invited account must choose its own password before it can go anywhere.
  if (profile?.must_change_password) return <ChangePasswordGate />;

  if (allowedRole && profile?.role !== allowedRole) {
    const roleRoutes: Record<UserRole, string> = {
      owner: '/dashboard/owner',
      technician: '/dashboard/technician',
      admin: '/dashboard/admin',
      customer: '/dashboard/customer',
      manager: '/dashboard/manager',
    };
    return <Navigate to={roleRoutes[profile?.role ?? 'customer']} replace />;
  }

  return <>{children}</>;
}
