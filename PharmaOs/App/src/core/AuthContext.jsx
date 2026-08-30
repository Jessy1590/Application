import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // NOUVEAU : On stocke le profil (nom)
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fonction pour aller chercher le nom dans portail.profiles
    const fetchProfile = async (userId) => {
      const { data } = await supabase.schema('portail').from('profiles').select('display_name').eq('id', userId).single();
      setProfile(data);
      setIsLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        fetchProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = ({ email, password }) => supabase.auth.signInWithPassword({ email, password });
  const signOut = () => supabase.auth.signOut();

  const value = {
    user: session?.user ?? null,
    profile, // NOUVEAU : Expose le profil aux composants
    session,
    isAuthenticated: !!session,
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