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
  created_at: string;
}
