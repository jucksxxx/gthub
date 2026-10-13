import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;
/** Service-role client. Server-only: bookings hold PII and have no public RLS policies. */
export function getAdminClient(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase env vars');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
export const rows = <T,>(data: unknown): T[] => (data ?? []) as T[];
