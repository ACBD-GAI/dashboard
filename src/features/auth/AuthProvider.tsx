import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { supabase } from "../../lib/supabase/client";
import type { Profile } from "../../types/domain";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,display_name,role,active")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as Profile | null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!session?.user.id) {
      setProfile(null);
      return;
    }
    try {
      setError(null);
      setProfile(await fetchProfile(session.user.id));
    } catch {
      setProfile(null);
      setError("Your account profile could not be loaded.");
    }
  }, [session?.user.id]);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }
      setSession(data.session);
      if (data.session) {
        try {
          setProfile(await fetchProfile(data.session.user.id));
        } catch {
          setError("Your account profile could not be loaded.");
        }
      }
      if (active) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setProfile(null);
      setError(null);
      if (nextSession) {
        setLoading(true);
        queueMicrotask(() => {
          void fetchProfile(nextSession.user.id)
            .then((nextProfile) => active && setProfile(nextProfile))
            .catch(
              () =>
                active && setError("Your account profile could not be loaded."),
            )
            .finally(() => active && setLoading(false));
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    queryClient.clear();
    setSession(null);
    setProfile(null);
  }, [queryClient]);

  const value = useMemo(
    () => ({ session, profile, loading, error, refreshProfile, signOut }),
    [session, profile, loading, error, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The hook intentionally shares the provider's private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
