import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, Profile } from '../lib/supabase';
import {
  allows, fetchMyPermissions, fetchMyTenant,
  type ModuleAction, type ModuleKey, type PermissionMap, type TenantSummary,
} from '../lib/permissions';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** The company this user belongs to; null for a platform admin. */
  tenant: TenantSummary | null;
  /** Every module, already resolved through all three permission layers. */
  permissions: PermissionMap;
  /** Above every tenant — us, not a customer. */
  isPlatformAdmin: boolean;
  /** Hides what the user may not do. The database refuses it regardless. */
  can: (module: ModuleKey, action?: ModuleAction) => boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setProfile(data);

    /* Who they work for, and what they may open. */
    const [map, company] = await Promise.all([
      fetchMyPermissions(),
      fetchMyTenant(data?.tenant_id),
    ]);
    setPermissions(map);
    setTenant(company);
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        (async () => {
          await fetchProfile(session.user.id);
          setLoading(false);
        })();
      } else {
        setProfile(null);
        setTenant(null);
        setPermissions({});
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  const isPlatformAdmin = Boolean(profile?.is_platform_admin);

  /* A platform admin is not inside a tenant, so nothing is hidden from them. */
  function can(module: ModuleKey, action: ModuleAction = 'view'): boolean {
    return isPlatformAdmin || allows(permissions, module, action);
  }

  return (
    <AuthContext.Provider value={{
      user, session, profile, tenant, permissions, isPlatformAdmin, can,
      loading, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
