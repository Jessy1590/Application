/**
 * Expose les APIs Location en globals (compat modules UI PhieEvreux IIFE).
 * Schéma données : PharmaOs via supabaseClient.
 */
import { supabase } from '../../../shared/supabaseClient.js';
import * as LocationData from './locationService.js';
import * as LocationRules from './locationRules.js';
import * as LocationPrint from './locationPrint.js';

const g = typeof window !== 'undefined' ? window : globalThis;

/** Shim OCR Edge Functions — remplace PhieEvreuxApps (même projet Supabase). */
g.PhieEvreuxApps = {
  SCHEMA: 'PharmaOs',
  getCfg() {
    return {
      url: import.meta.env.VITE_SUPABASE_URL,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    };
  },
  createAppsClient() {
    return supabase;
  },
  createPortailClient() {
    return supabase;
  },
};

g.LocationData = LocationData;
g.LocationRules = LocationRules;
g.LocationPrint = LocationPrint;

/** Thème Location : toujours clair PharmaOS (plus de bascule Phie dark/light). */
g.PhieTheme = {
  current() {
    return 'light';
  },
  apply() {
    document.querySelectorAll('.loc-shell').forEach((el) => {
      el.removeAttribute('data-theme');
    });
    return 'light';
  },
  toggle() {
    return g.PhieTheme.apply();
  },
  init() {
    return g.PhieTheme.apply();
  },
};

/** Stubs logs / fab / équipe (hors périmètre PharmaOS Location). */
g.PhieLogs = g.PhieLogs || {
  setContext() {},
  session() {},
  navigate() {},
  action() {},
};
g.PhieFab = g.PhieFab || { mount() {} };
g.PhieEquipe = g.PhieEquipe || {
  async load() {
    return null;
  },
};

export function ensureLocationGlobals() {
  g.LocationData = LocationData;
  g.LocationRules = LocationRules;
  g.LocationPrint = LocationPrint;
  return g;
}
