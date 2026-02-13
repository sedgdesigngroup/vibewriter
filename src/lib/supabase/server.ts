import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key || url === 'your_supabase_url_here') {
      throw new Error('Supabase 환경변수를 설정해주세요 (.env.local)');
    }

    _supabaseAdmin = createClient(url, key);
  }
  return _supabaseAdmin;
}

// 하위 호환성을 위한 getter (런타임에만 초기화)
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseAdmin() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
