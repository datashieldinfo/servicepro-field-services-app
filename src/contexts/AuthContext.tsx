import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, Profile } from '../lib/supabase';
import {
  allows, fetchMyPermissions, fetchMyTenant,
  type ModuleAction, type ModuleKey, type PermissionMap, type TenantSummary,
} from '../lib/permissions';
import {
  fetchImpersonation, startImpersonation, stopImpersonation,
  type ImpersonationState,
} from '../lib/impersonation';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  /**
   * Who the app should behave as. While a superadmin is viewing the app as
   * someone else this is *their* profile, not the superadmin's — which is what
   * routes the browser to their dashboard and hides what they cannot open.
   */
  profile: Profile | null;
  /** The signed-in account itself, whoever it is currently acting as. */
  realProfile: Profile | null;
  /** The company this user belongs to; null for a platform admin. */
  tenant: TenantSummary | null;
  /** Every module, already resolved through all three permission layers. */
  permissions: PermissionMap;
  /**
   * Above every tenant — and false while impersonating, because during it the
   * database gives the superadmin no more than the user they are viewing as.
   */
  isPlatformAdmin: boolean;
  /** The account is a superadmin, whether or not it is currently acting as one. */
  isSuperadmin: boolean;
  /** Set while viewing the app as another user. */
  impersonation: ImpersonationState | null;
  viewAs: (targetId: string, allowChanges?: boolean, reason?: string) => Promise<string | null>;
  stopViewingAs: () => Promise<void>;
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
  const [realProfile, setRealProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId: string) {
    const { data: own } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setRealProfile(own);

    /* Is this session standing in for someone? The database is asked rather
       than the column read, so an expired session is already over here too. */
    const acting = own?.is_platform_admin ? await fetchImpersonation() : null;
    setImpersonation(acting);

    let effective = own;
    if (acting) {
      const { data: target } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', acting.targetId)
        .maybeSingle();
      if (target) effective = target;
    }
    setProfile(effective);

    /* Who they work for, and what they may open — both answered for whoever
       the database now counts this request as. */
    const [map, company] = await Promise.all([
      fetchMyPermissions(),
      fetchMyTenant(effective?.tenant_id),
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
        setRealProfile(null);
        setTenant(null);
        setPermissions({});
        setImpersonation(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    /* Never leave a session parked on someone else's account. */
    if (impersonation) await stopImpersonation();
    await supabase.auth.signOut();
  }

  /** Returns an error message, or null when the switch took. */
  async function viewAs(targetId: string, allowChanges = false, reason = ''): Promise<string | null> {
    const { error } = await startImpersonation(targetId, allowChanges, reason);
    if (error) return error;
    await refreshProfile();
    return null;
  }

  async function stopViewingAs() {
    await stopImpersonation();
    await refreshProfile();
  }

  const isSuperadmin = Boolean(realProfile?.is_platform_admin);
  const isPlatformAdmin = isSuperadmin && !impersonation;

  /* A platform admin is not inside a tenant, so nothing is hidden from them —
     unless they are currently viewing the app as someone who is. */
  function can(module: ModuleKey, action: ModuleAction = 'view'): boolean {
    return isPlatformAdmin || allows(permissions, module, action);
  }

  return (
    <AuthContext.Provider value={{
      user, session, profile, realProfile, tenant, permissions,
      isPlatformAdmin, isSuperadmin, impersonation, viewAs, stopViewingAs,
      can, loading, signOut, refreshProfile,
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
