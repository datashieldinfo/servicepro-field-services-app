import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'owner' | 'technician' | 'admin' | 'customer' | 'manager';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  phone: string;
  must_change_password?: boolean;
  /** The company this account belongs to; null only for a platform admin. */
  tenant_id?: string | null;
  permission_set_id?: string | null;
  is_platform_admin?: boolean;
  active?: boolean;
  created_at: string;
}
