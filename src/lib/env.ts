const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigured = Boolean(url && anonKey);

export const publicEnv = {
  supabaseUrl: url || "http://127.0.0.1:54321",
  supabaseAnonKey: anonKey || "missing-anon-key",
};
