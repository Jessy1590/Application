import React, { useState } from 'react';
import { User, ExternalLink, Palette, PanelTop, Type } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { openExternal } from '../../../shared/windowService.js';
import {
  THEME_OPTIONS,
  PLACEMENT_OPTIONS,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
} from '../../prefs/services/prefsService.js';

const PORTAIL_URL = (import.meta.env.VITE_PORTAIL_URL || '').replace(/\/$/, '');

function SelectField({ label, value, options, onChange, disabled }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--input-bg)] text-[var(--fg)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/** Self-service UI : thème / taskbar / polices + lien Portail pour le mot de passe. */
export default function AccountPage() {
  const { user, profile, preferences, updatePreferences } = useAuth();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const save = async (patch) => {
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      await updatePreferences(patch);
      setMsg('Préférences enregistrées');
    } catch (e) {
      setErr(e.message || 'Échec enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const openPortail = (path = '') => {
    if (!PORTAIL_URL) {
      setErr('VITE_PORTAIL_URL non configuré');
      return;
    }
    openExternal(`${PORTAIL_URL}${path}`);
  };

  return (
    <div className="max-w-lg mx-auto w-full space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-[var(--fg)] flex items-center gap-2">
          <User className="text-[var(--accent)]" size={24} /> Mon compte
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          {profile?.display_name || user?.email}
        </p>
      </header>

      <section className="space-y-4 p-5 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]">
        <h2 className="text-sm font-semibold text-[var(--fg)] flex items-center gap-2">
          <Palette size={16} /> Apparence
        </h2>
        <SelectField
          label="Thème"
          value={preferences?.theme || 'clair'}
          options={THEME_OPTIONS}
          disabled={saving}
          onChange={(theme) => save({ theme })}
        />
        <p className="text-xs text-[var(--muted)]">
          Bleu Doré : palette bleu profond et or. Coloré : base claire avec accents vifs.
        </p>
      </section>

      <section className="space-y-4 p-5 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]">
        <h2 className="text-sm font-semibold text-[var(--fg)] flex items-center gap-2">
          <PanelTop size={16} /> Barre d’outils
        </h2>
        <SelectField
          label="Placement"
          value={preferences?.taskbar_placement || 'haut'}
          options={PLACEMENT_OPTIONS}
          disabled={saving}
          onChange={(taskbar_placement) => save({ taskbar_placement })}
        />
        <SelectField
          label="Densité"
          value={preferences?.taskbar_density || 'normal'}
          options={DENSITY_OPTIONS}
          disabled={saving}
          onChange={(taskbar_density) => save({ taskbar_density })}
        />
        <p className="text-xs text-[var(--muted)]">
          Compacte : logos seuls. Normale : sous-groupes + logos. Détaillée : noms des modules. Empilée : logos sous les sous-groupes.
        </p>
      </section>

      <section className="space-y-4 p-5 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]">
        <h2 className="text-sm font-semibold text-[var(--fg)] flex items-center gap-2">
          <Type size={16} /> Taille de police
        </h2>
        <SelectField
          label="Barre d’outils"
          value={preferences?.font_size_taskbar || 'md'}
          options={FONT_SIZE_OPTIONS}
          disabled={saving}
          onChange={(font_size_taskbar) => save({ font_size_taskbar })}
        />
        <SelectField
          label="Dashboard"
          value={preferences?.font_size_dashboard || 'md'}
          options={FONT_SIZE_OPTIONS}
          disabled={saving}
          onChange={(font_size_dashboard) => save({ font_size_dashboard })}
        />
      </section>

      <section className="space-y-3 p-5 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]">
        <h2 className="text-sm font-semibold text-[var(--fg)]">Sécurité du compte</h2>
        <p className="text-sm text-[var(--muted)]">
          Mot de passe, e-mail et récupération se gèrent sur le Portail Application.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openPortail('/')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-medium hover:opacity-90"
          >
            <ExternalLink size={14} /> Ouvrir le Portail
          </button>
          <button
            type="button"
            onClick={() => openPortail('/#mot-de-passe')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--fg)] hover:bg-[var(--input-bg)]"
          >
            Changer le mot de passe
          </button>
        </div>
      </section>

      {msg && <p className="text-sm text-[var(--success)]">{msg}</p>}
      {err && <p className="text-sm text-[var(--danger)]">{err}</p>}
    </div>
  );
}
