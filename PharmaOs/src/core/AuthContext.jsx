import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../shared/supabaseClient.js';
import { fetchRoleAccess } from '../modules/admin/services/accessService.js';
import { fetchMyCasquetteGrants } from '../modules/admin/services/casquetteService.js';
import { mustChangePasswordFromUser } from '../modules/admin/services/accountService.js';
import { canAccessFeature } from './access.js';
import {
  canonicalRole, isAppAdministrateur as roleIsAppAdmin, isDisabledRole,
  DISABLED_ACCOUNT_MESSAGE,
} from './roles.js';
import { setLogActor, logEvent, bindGlobalErrorLogging } from '../shared/logService.js';

const AuthContext = createContext(null);

/**
 * Auth unifiée : session Supabase + display_name + role depuis portail.profiles.
 * Accès dashboard / taskbar via matrice (rôle + role_access) OU casquettes.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [accessOverrides, setAccessOverrides] = useState([]);
  const [casquetteGrants, setCasquetteGrants] = useState([]);
  const [casquetteSlugs, setCasquetteSlugs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authBlockMessage, setAuthBlockMessage] = useState(null);
  const loginLogged = useRef(false);

  const reloadAccess = useCallback(async (userId) => {
    try {
      const [overrides, grants] = await Promise.all([
        fetchRoleAccess(),
        userId ? fetchMyCasquetteGrants(userId) : Promise.resolve({ grants: [], slugs: [] }),
      ]);
      setAccessOverrides(overrides);
      setCasquetteGrants(grants.grants || []);
      setCasquetteSlugs(grants.slugs || []);
    } catch {
      setAccessOverrides([]);
      setCasquetteGrants([]);
      setCasquetteSlugs([]);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const unbindErrors = bindGlobalErrorLogging();

    const fetchProfile = async (userId) => {
      const { data, error } = await supabase
        .schema('portail')
        .from('profiles')
        .select('display_name, role, job_title, email, must_change_password')
        .eq('id', userId)
        .single();

      if (!isMounted) return;
      let next = error ? null : data;
      // Colonne must_change_password absente (migration non appliquée) → retry sans.
      if (error && /must_change_password/i.test(error.message || '')) {
        const retry = await supabase
          .schema('portail')
          .from('profiles')
          .select('display_name, role, job_title, email')
          .eq('id', userId)
          .single();
        next = retry.error ? null : { ...retry.data, must_change_password: false };
      }
      setProfile(next);
      setLogActor({
        userId,
        userName: next?.display_name || null,
        userRole: next?.role || null,
      });
      if (isDisabledRole(next?.role)) {
        setAuthBlockMessage(DISABLED_ACCOUNT_MESSAGE);
        await supabase.auth.signOut();
        return;
      }
      setAuthBlockMessage(null);
      await reloadAccess(userId);
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
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        fetchProfile(newSession.user.id);
        if (event === 'SIGNED_IN' && !loginLogged.current) {
          loginLogged.current = true;
          setTimeout(() => {
            if (isDisabledRole(profile?.role)) return;
            logEvent({
              category: 'auth',
              action: 'login',
              message: 'Connexion',
              details: { email: newSession.user.email, event },
              flush: true,
            });
          }, 400);
        }
      } else {
        loginLogged.current = false;
        setProfile(null);
        setAccessOverrides([]);
        setCasquetteGrants([]);
        setCasquetteSlugs([]);
        setLogActor({ userId: null, userName: null, userRole: null });
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      unbindErrors();
    };
  }, [reloadAccess]);

  const signIn = async ({ email, password }) => {
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) return result;
    const userId = result.data?.user?.id;
    if (!userId) return result;
    const { data: prof } = await supabase
      .schema('portail')
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (isDisabledRole(prof?.role)) {
      setAuthBlockMessage(DISABLED_ACCOUNT_MESSAGE);
      await supabase.auth.signOut();
      return { data: { user: null, session: null }, error: { message: DISABLED_ACCOUNT_MESSAGE } };
    }
    setAuthBlockMessage(null);
    return result;
  };

  const signOut = async () => {
    if (!isDisabledRole(role)) {
      await logEvent({
        category: 'auth',
        action: 'logout',
        message: 'Déconnexion demandée',
        flush: true,
      });
    }
    return supabase.auth.signOut();
  };

  const role = profile?.role ?? null;
  const canonRole = canonicalRole(role);
  const disabled = isDisabledRole(role);

  const canAccess = useCallback(
    (surface, featureId) => {
      if (isDisabledRole(role)) return false;
      return canAccessFeature(role, surface, featureId, accessOverrides, casquetteGrants);
    },
    [role, accessOverrides, casquetteGrants],
  );

  const hasCasquette = useCallback(
    (slug) => casquetteSlugs.includes(slug),
    [casquetteSlugs],
  );

  const reloadAccessBound = useCallback(
    () => reloadAccess(session?.user?.id),
    [reloadAccess, session?.user?.id],
  );

  const reloadProfile = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return null;
    const { data, error } = await supabase
      .schema('portail')
      .from('profiles')
      .select('display_name, role, job_title, email, must_change_password')
      .eq('id', userId)
      .single();
    if (error && /must_change_password/i.test(error.message || '')) {
      const retry = await supabase
        .schema('portail')
        .from('profiles')
        .select('display_name, role, job_title, email')
        .eq('id', userId)
        .single();
      const next = retry.error ? null : { ...retry.data, must_change_password: false };
      setProfile(next);
      return next;
    }
    if (!error) setProfile(data);
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session) setSession(sess.session);
    return data;
  }, [session?.user?.id]);

  const mustChangePassword = mustChangePasswordFromUser(session?.user, profile);

  const value = {
    user: session?.user ?? null,
    profile,
    role,
    canonicalRole: canonRole,
    session,
    isAuthenticated: !!session && !disabled,
    isDisabled: disabled,
    mustChangePassword: !disabled && !!mustChangePassword,
    isAdmin: !disabled && canAccess('dashboard', 'dashboard'),
    isAppAdministrateur: roleIsAppAdmin(role),
    canDashboard: !disabled && canAccess('dashboard', 'dashboard'),
    canAccess,
    hasCasquette,
    casquetteGrants,
    casquetteSlugs,
    accessOverrides,
    reloadAccess: reloadAccessBound,
    reloadProfile,
    isLoading,
    authBlockMessage,
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
