import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient.js';

/**
 * Le rôle est lu dans portail.profiles.role (table existante, contrainte
 * check à 'admin' | 'member' — voir dashboard/supabase/dashboard-rls.sql).
 * Seul 'admin' donne accès à ce dashboard.
 *
 * supabase (services/supabaseClient.js) est configuré par défaut sur le
 * schéma 'PharmaOs' ; on cible explicitement 'portail' ici via .schema().
 */
const ALLOWED_ROLES = ['admin'];

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadSessionAndProfile = async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();

      if (!isMounted) return;
      setSession(initialSession);
      await loadProfileRole(initialSession);
      if (isMounted) setIsLoading(false);
    };

    const loadProfileRole = async (currentSession) => {
      if (!currentSession?.user?.id) {
        setRole(null);
        return;
      }
      const { data, error } = await supabase
        .schema('portail')
        .from('profiles')
        .select('role')
        .eq('id', currentSession.user.id)
        .single();

      if (!isMounted) return;
      setRole(error ? null : data?.role ?? null);
    };

    loadSessionAndProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      loadProfileRole(newSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = ({ email, password }) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = () => supabase.auth.signOut();

  const user = session?.user ?? null;

  const value = {
    user,
    session,
    role,
    isLoading,
    isAuthenticated: !!session,
    // Connecté ET rôle admin (portail.profiles) : seule condition d'accès au dashboard
    isAuthorized: !!session && ALLOWED_ROLES.includes(role),
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
