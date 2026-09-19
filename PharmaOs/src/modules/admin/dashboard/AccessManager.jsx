import React, { useCallback, useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  ACCESS_ROLES, CANONICAL_ROLES, ROLE_LABELS, canonicalRole, labelRole, isDisabledRole,
} from '../../../core/roles.js';
import {
  TASKBAR_FEATURES, DASHBOARD_FEATURES, isFeatureAllowed,
} from '../../../core/access.js';
import {
  fetchAllProfiles, fetchRoleAccess, updateProfileRole, upsertRoleAccess,
} from '../services/accessService.js';
import { useRealtimeRefresh } from '../../../shared/useRealtimeRefresh.js';

function MatrixTable({ title, surface, features, overrides, onToggle, disabled }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800 text-sm">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-2.5 text-left font-semibold">Mission</th>
              {ACCESS_ROLES.map((role) => (
                <th key={role} className="p-2.5 text-center font-semibold">{ROLE_LABELS[role]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.id} className="border-t border-slate-100">
                <td className="p-2.5 text-slate-700">{f.label}</td>
                {ACCESS_ROLES.map((role) => {
                  const on = isFeatureAllowed(role, surface, f.id, overrides);
                  return (
                    <td key={role} className="p-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={disabled}
                        onChange={() => onToggle(role, surface, f.id, !on)}
                        className="w-4 h-4 accent-sky-600"
                        title={`${ROLE_LABELS[role]} — ${f.label}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AccessManager() {
  const { user, profile, reloadAccess, isAppAdministrateur } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [p, a] = await Promise.all([fetchAllProfiles(), fetchRoleAccess()]);
      setProfiles(p);
      setOverrides(a);
    } catch (e) {
      setErr(e.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(load, { tables: ['role_access'] });

  const handleRole = async (profileId, role) => {
    setErr('');
    setMsg('');
    try {
      await updateProfileRole(profileId, role, profile?.display_name, { actorId: user?.id });
      setMsg('Rôle mis à jour.');
      load();
    } catch (e) {
      setErr(e.message || 'Impossible de changer le rôle.');
    }
  };

  const handleToggle = async (role, surface, featureId, allowed) => {
    setErr('');
    try {
      await upsertRoleAccess(role, surface, featureId, allowed, user?.id);
      const next = await fetchRoleAccess();
      setOverrides(next);
      await reloadAccess?.();
    } catch (e) {
      setErr(e.message || 'Impossible d’enregistrer l’accès.');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-1 flex items-center gap-2">
        <Shield className="text-indigo-600" /> Accès & rôles
      </h1>
      <p className="text-sm text-slate-500 mb-4">
        Pharmacien, administrateur, gestionnaire, préparateur. Le rôle <strong>Désactivé</strong> coupe tout accès : la personne ne peut plus se connecter à PharmaOS avec ces identifiants.
      </p>

      {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}
      {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm">{msg}</div>}
      {loading && profiles.length === 0 && <p className="text-sm text-slate-500 mb-4">Chargement…</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 text-sm">Utilisateurs</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-2.5 text-left font-semibold">Nom</th>
              <th className="p-2.5 text-left font-semibold">Email</th>
              <th className="p-2.5 text-left font-semibold">Rôle actuel</th>
              <th className="p-2.5 text-left font-semibold">Attribuer</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className={`border-t border-slate-100 ${isDisabledRole(p.role) ? 'bg-red-50/60' : ''}`}>
                <td className="p-2.5 font-medium text-slate-800">{p.display_name || '—'}</td>
                <td className="p-2.5 text-slate-500">{p.email || '—'}</td>
                <td className="p-2.5 text-slate-600">
                  {labelRole(p.role)}
                  {isDisabledRole(p.role) && (
                    <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-red-600">sans accès</span>
                  )}
                </td>
                <td className="p-2.5">
                  <select
                    value={canonicalRole(p.role)}
                    disabled={!isAppAdministrateur}
                    onChange={(e) => handleRole(p.id, e.target.value)}
                    className={`text-sm border border-slate-300 rounded-lg px-2 py-1 bg-white ${isDisabledRole(p.role) ? 'text-red-700' : ''}`}
                  >
                    {CANONICAL_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-2.5 text-xs text-slate-500 border-t border-slate-100">
          Désactivé = identifiants conservés mais connexion refusée. Réattribuez un rôle actif pour rétablir l’accès.
        </p>
      </div>

      <MatrixTable
        title="Missions taskbar (décoché = invisible)"
        surface="taskbar"
        features={TASKBAR_FEATURES}
        overrides={overrides}
        onToggle={handleToggle}
        disabled={!isAppAdministrateur}
      />
      <MatrixTable
        title="Pages dashboard (décoché = accès refusé)"
        surface="dashboard"
        features={DASHBOARD_FEATURES}
        overrides={overrides}
        onToggle={handleToggle}
        disabled={!isAppAdministrateur}
      />
    </div>
  );
}
