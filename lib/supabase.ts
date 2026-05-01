import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getSupabaseClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const supabase = {
  get client() {
    return getSupabaseClient();
  },
};

export const supabaseAdmin = {
  from: (table: string) => getSupabaseAdmin().from(table),
  auth: {
    getUser: (token?: string) => getSupabaseAdmin().auth.getUser(token),
  },
};

export async function saveSearchHistory(
  userId: string,
  keyword: string,
  summary: { verdict: string; totalScore: number }
) {
  return getSupabaseAdmin().from('search_history').insert({
    user_id: userId,
    keyword,
    result_summary: summary,
  });
}

export async function saveReport(userId: string, keyword: string, reportData: object) {
  return getSupabaseAdmin().from('saved_reports').insert({
    user_id: userId,
    keyword,
    report_data: reportData,
  });
}

export async function getSearchHistory(userId: string) {
  return getSupabaseAdmin()
    .from('search_history')
    .select('*')
    .eq('user_id', userId)
    .order('searched_at', { ascending: false })
    .limit(20);
}

export async function getSavedReports(userId: string) {
  return getSupabaseAdmin()
    .from('saved_reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}
