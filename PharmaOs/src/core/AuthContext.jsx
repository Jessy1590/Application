import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../shared/supabaseClient.js';
import { fetchRoleAccess } from '../modules/admin/services/accessService.js';
import { fetchMyCasquetteGrants } from '../modules/admin/services/casquetteService.js';
import {
  fetchPreferences,
  upsertPreferences,
  applyTheme,
  applyFontSizes,
  DEFAULT_PREFERENCES,
} from '../modules/prefs/services/prefsService.js';
import { canAccessFeature } from './access.js';
import {
  canonicalRole, isAppAdministrateur as roleIsAppAdmin, isDisabledRole,
  DISABLED_ACCOUNT_MESSAGE,
} from './roles.js';
import { setLogActor, logEvent, bindGlobalErrorLogging } from '../shared/logService.js';
import { setTaskbarLayout, onPrefsChanged } from '../shared/windowService.js';

const AuthContext = createContext(null);

/**
 * Auth unifiée : session Supabase + display_name + role depuis portail.profiles.
 * Accès dashboard / taskbar via matrice (rôle + role_access) OU casquettes.
 * Préférences UI : thème + layout taskbar.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [accessOverrides, setAccessOverrides] = useState([]);
  const [casquetteGrants, setCasquetteGrants] = useState([]);
  const [casquetteSlugs, setCasquetteSlugs] = useState([]);
  const [preferences, setPreferences] = useState({ ...DEFAULT_PREFERENCES });
  const [isLoading, setIsLoading] = useState(true);
  const [authBlockMessage, setAuthBlockMessage] = useState(null);
  const loginLogged = useRef(false);

  const syncTaskbarLayout = useCallback((prefs) => {
    const p = prefs || DEFAULT_PREFERENCES;
    setTaskbarLayout({
      placement: p.taskbar_placement,
      density: p.taskbar_density,
      theme: p.theme,
      font_size_taskbar: p.font_size_taskbar,
      font_size_dashboard: p.font_size_dashboard,
    });
  }, []);

  const applyPreferences = useCallback((prefs, { syncLayout = true } = {}) => {
    const next = prefs || DEFAULT_PREFERENCES;
    setPreferences(next);
    applyTheme(next.theme);
    applyFontSizes(next);
    if (syncLayout) syncTaskbarLayout(next);
  }, [syncTaskbarLayout]);

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
    applyTheme(DEFAULT_PREFERENCES.theme);
    applyFontSizes(DEFAULT_PREFERENCES);

    const fetchProfile = async (userId) => {
      const { data, error } = await supabase
        .schema('portail')
        .from('profiles')
        .select('display_name, role, job_title')
        .eq('id', userId)
        .single();

      if (!isMounted) return;
      const next = error ? null : data;
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
      try {
        const prefs = await fetchPreferences(userId);
        if (isMounted) applyPreferences(prefs);
      } catch {
        if (isMounted) applyPreferences(DEFAULT_PREFERENCES);
      }
    };

    supabase.auth.getSession().then(({ data: { session: initial } }) => {
      if (!isMounted) return;
      setSession(initial);
      if (initial?.user) {
        fetchProfile(initial.user.id).finally(() => {
          if (isMounted) setIsLoading(false);
        });
      } else {
        applyTheme(DEFAULT_PREFERENCES.theme);
        applyFontSizes(DEFAULT_PREFERENCES);
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
        applyPreferences(DEFAULT_PREFERENCES);
        setLogActor({ userId: null, userName: null, userRole: null });
      }
    });

    const unsubPrefs = onPrefsChanged((payload) => {
      if (!payload || typeof payload !== 'object') return;
      applyPreferences(
        {
          theme: payload.theme || DEFAULT_PREFERENCES.theme,
          taskbar_placement: payload.placement || DEFAULT_PREFERENCES.taskbar_placement,
          taskbar_density: payload.density || DEFAULT_PREFERENCES.taskbar_density,
          font_size_taskbar: payload.font_size_taskbar || DEFAULT_PREFERENCES.font_size_taskbar,
          font_size_dashboard: payload.font_size_dashboard || DEFAULT_PREFERENCES.font_size_dashboard,
        },
        { syncLayout: false },
      );
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      unbindErrors();
      unsubPrefs?.();
    };
  }, [reloadAccess, applyPreferences]);

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

  const updatePreferences = useCallback(async (patch) => {
    const userId = session?.user?.id;
    if (!userId) throw new Error('Non connecté');
    const next = await upsertPreferences(userId, patch);
    applyPreferences(next);
    return next;
  }, [session?.user?.id, applyPreferences]);

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

  const value = {
    user: session?.user ?? null,
    profile,
    role,
    canonicalRole: canonRole,
    session,
    isAuthenticated: !!session && !disabled,
    isDisabled: disabled,
    isAdmin: !disabled && canAccess('dashboard', 'dashboard'),
    isAppAdministrateur: roleIsAppAdmin(role),
    canDashboard: !disabled && canAccess('dashboard', 'dashboard'),
    canAccess,
    hasCasquette,
    casquetteGrants,
    casquetteSlugs,
    accessOverrides,
    reloadAccess: reloadAccessBound,
    preferences,
    updatePreferences,
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
