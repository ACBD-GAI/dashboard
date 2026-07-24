import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "../env";

export const supabase = createClient(
  publicEnv.supabaseUrl,
  publicEnv.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
