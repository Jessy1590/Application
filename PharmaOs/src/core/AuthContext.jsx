import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../shared/supabaseClient.js';

const AuthContext = createContext(null);

/**
 * Auth unifiée : session Supabase + display_name + role depuis portail.profiles.
 * Le Dashboard admin lit role === 'admin' ; la Taskbar masque le bouton sinon.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchProfile = async (userId) => {
      const { data, error } = await supabase
        .schema('portail')
        .from('profiles')
        .select('display_name, role')
        .eq('id', userId)
        .single();

      if (!isMounted) return;
      setProfile(error ? null : data);
    };

    supabase.auth.getSession().then(({ data: { session: initial } }) => {
      if (!isMounted) return;
      setSession(initial);
      if (initial?.user) {
        fetchProfile(initial.user.id).finally(() => {
          if (isMounted) setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        fetchProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = ({ email, password }) =>
    supabase.auth.signInWithPassword({ email, password });
  const signOut = () => supabase.auth.signOut();

  const role = profile?.role ?? null;

  const value = {
    user: session?.user ?? null,
    profile,
    role,
    session,
    isAuthenticated: !!session,
    isAdmin: role === 'admin',
    isLoading,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit etre utilise a l'interieur d'un AuthProvider");
  return ctx;
}
