import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function saveSearchHistory(
  userId: string,
  keyword: string,
  summary: { verdict: string; totalScore: number }
) {
  return supabaseAdmin.from('search_history').insert({
    user_id: userId,
    keyword,
    result_summary: summary,
  });
}

export async function saveReport(userId: string, keyword: string, reportData: object) {
  return supabaseAdmin.from('saved_reports').insert({
    user_id: userId,
    keyword,
    report_data: reportData,
  });
}

export async function getSearchHistory(userId: string) {
  return supabaseAdmin
    .from('search_history')
    .select('*')
    .eq('user_id', userId)
    .order('searched_at', { ascending: false })
    .limit(20);
}

export async function getSavedReports(userId: string) {
  return supabaseAdmin
    .from('saved_reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}
