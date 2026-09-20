import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Shield, HelpCircle, Users, Tags, LayoutGrid, LayoutDashboard, ListTodo,
} from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  ACCESS_ROLES, CANONICAL_ROLES, ROLE_LABELS, canonicalRole, labelRole, isDisabledRole,
} from '../../../core/roles.js';
import {
  TASKBAR_FEATURES, DASHBOARD_FEATURES, isFeatureAllowed,
} from '../../../core/access.js';
import { DASHBOARD_WIDGETS, DASHBOARD_MODULES, DASHBOARD_CATEGORIES, defaultWidgetVisible } from '../../../core/dashboardWidgets.js';
import {
  fetchAllProfiles, fetchRoleAccess, updateProfileRole, upsertRoleAccess,
  fetchRoleDashboardWidgets, upsertRoleDashboardWidget,
  fetchTaskRoleRules, upsertTaskRoleRule,
} from '../services/accessService.js';
import {
  fetchCasquettes, fetchCasquetteFeatures, fetchAllProfileCasquettes,
  createCasquette, updateCasquette, setCasquetteFeatures, setProfileCasquettes,
} from '../services/casquetteService.js';
import { TASK_MODULES, taskCategoriesForModule } from '../../tasks/services/taskService.js';
import { useRealtimeRefresh } from '../../../shared/useRealtimeRefresh.js';
import InviteUserPanel from './InviteUserPanel.jsx';

const TASK_MODES = [
  { value: 'never', label: 'Jamais' },
  { value: 'immediate', label: 'Immédiat' },
  { value: 'after_delay', label: 'Après délai' },
];

const ACCESS_TABS = Object.freeze([
  { id: 'utilisateurs', label: 'Utilisateurs', Icon: Users },
  { id: 'casquettes', label: 'Casquettes', Icon: Tags },
  { id: 'modules', label: 'Modules', Icon: LayoutGrid },
  { id: 'widgets', label: 'Widgets', Icon: LayoutDashboard },
  { id: 'taches', label: 'Assignation tâches', Icon: ListTodo },
]);

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
  const [casquettes, setCasquettes] = useState([]);
  const [casquetteFeatures, setCasquetteFeaturesState] = useState([]);
  const [profileCasquettes, setProfileCasquettesState] = useState([]);
  const [widgets, setWidgets] = useState([]);
  const [taskRules, setTaskRules] = useState([]);
  const [pageTab, setPageTab] = useState('utilisateurs');
  const [taskModuleTab, setTaskModuleTab] = useState(TASK_MODULES[0]?.id || 'taches');
  const [selectedCasquetteId, setSelectedCasquetteId] = useState(null);
  const [newCasq, setNewCasq] = useState({ slug: '', label: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [p, a, c, cf, pc, w, tr] = await Promise.all([
        fetchAllProfiles(),
        fetchRoleAccess(),
        fetchCasquettes(),
        fetchCasquetteFeatures(),
        fetchAllProfileCasquettes(),
        fetchRoleDashboardWidgets(),
        fetchTaskRoleRules(),
      ]);
      setProfiles(p);
      setOverrides(a);
      setCasquettes(c);
      setCasquetteFeaturesState(cf);
      setProfileCasquettesState(pc);
      setWidgets(w);
      setTaskRules(tr);
      setSelectedCasquetteId((prev) => prev || c[0]?.id || null);
    } catch (e) {
      setErr(e.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(load, {
    tables: ['role_access', 'casquettes', 'casquette_features', 'profile_casquettes', 'role_dashboard_widgets', 'task_role_rules'],
  });

  const selectedCasquette = useMemo(
    () => casquettes.find((c) => c.id === selectedCasquetteId) || null,
    [casquettes, selectedCasquetteId],
  );

  const selectedFeatureKeys = useMemo(() => {
    const set = new Set();
    casquetteFeatures
      .filter((f) => f.casquette_id === selectedCasquetteId)
      .forEach((f) => set.add(`${f.surface}|${f.feature_id}`));
    return set;
  }, [casquetteFeatures, selectedCasquetteId]);

  const profileCasqMap = useMemo(() => {
    const map = {};
    for (const row of profileCasquettes) {
      if (!map[row.profile_id]) map[row.profile_id] = [];
      map[row.profile_id].push(row.casquette_id);
    }
    return map;
  }, [profileCasquettes]);

  const widgetVisible = (role, widgetId) => {
    const row = widgets.find((w) => w.role === role && w.widget_id === widgetId);
    if (row) return !!row.visible;
    return defaultWidgetVisible(role, widgetId);
  };

  const taskRule = (category, role) => {
    const row = taskRules.find((r) => r.category === category && r.role === role);
    return row || { mode: 'never', delay_hours: null };
  };

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

  const handleProfileCasquettes = async (profileId, casquetteId, checked) => {
    setErr('');
    try {
      const current = new Set(profileCasqMap[profileId] || []);
      if (checked) current.add(casquetteId);
      else current.delete(casquetteId);
      await setProfileCasquettes(profileId, [...current], profile?.display_name);
      setProfileCasquettesState(await fetchAllProfileCasquettes());
      await reloadAccess?.();
      setMsg('Casquettes utilisateur mises à jour.');
    } catch (e) {
      setErr(e.message || 'Impossible d’attribuer la casquette.');
    }
  };

  const handleCreateCasquette = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const row = await createCasquette(newCasq, user?.id);
      setNewCasq({ slug: '', label: '', description: '' });
      setSelectedCasquetteId(row.id);
      setMsg('Casquette créée.');
      load();
    } catch (e2) {
      setErr(e2.message || 'Création impossible.');
    }
  };

  const handleToggleCasquetteActive = async (id, active) => {
    try {
      await updateCasquette(id, { active }, user?.id);
      load();
    } catch (e) {
      setErr(e.message || 'Mise à jour impossible.');
    }
  };

  const handleToggleCasquetteFeature = async (surface, featureId, on) => {
    if (!selectedCasquetteId) return;
    setErr('');
    try {
      const next = new Set(selectedFeatureKeys);
      const key = `${surface}|${featureId}`;
      if (on) next.add(key);
      else next.delete(key);
      const rows = [...next].map((k) => {
        const [s, f] = k.split('|');
        return { surface: s, feature_id: f };
      });
      await setCasquetteFeatures(selectedCasquetteId, rows, user?.id);
      setCasquetteFeaturesState(await fetchCasquetteFeatures());
      await reloadAccess?.();
    } catch (e) {
      setErr(e.message || 'Features casquette : échec.');
    }
  };

  const handleWidgetToggle = async (role, widgetId, visible) => {
    setErr('');
    try {
      await upsertRoleDashboardWidget(role, widgetId, visible, user?.id);
      setWidgets(await fetchRoleDashboardWidgets());
    } catch (e) {
      setErr(e.message || 'Widget : échec.');
    }
  };

  const handleTaskRule = async (category, role, mode, delayHours) => {
    setErr('');
    try {
      await upsertTaskRoleRule(category, role, mode, delayHours, user?.id);
      setTaskRules(await fetchTaskRoleRules());
    } catch (e) {
      setErr(e.message || 'Règle tâche : échec.');
    }
  };

  const activeCasquettes = casquettes.filter((c) => c.active);
  const taskCatsForTab = useMemo(
    () => taskCategoriesForModule(taskModuleTab),
    [taskModuleTab],
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-1 flex items-center gap-2">
        <Shield className="text-indigo-600" /> Accès & rôles
      </h1>
      <p className="text-sm text-slate-500 mb-4">
        Rôles portail : pharmacien, administrateur, préparateur (+ désactivé).
        Les <strong>casquettes</strong> ajoutent des accès modules (ex. Location, Magistrales).
        Le sous-rôle Location Phie « gestionnaire » est distinct du rôle portail (supprimé).
      </p>

      {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}
      {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm">{msg}</div>}
      {loading && profiles.length === 0 && <p className="text-sm text-slate-500 mb-4">Chargement…</p>}

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-px mb-5">
        {ACCESS_TABS.map(({ id, label, Icon }) => {
          const active = pageTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPageTab(id)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-t-lg border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-slate-800 text-slate-900 font-semibold bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </div>

      {pageTab === 'utilisateurs' && (
      <>
      {isAppAdministrateur && (
        <InviteUserPanel onCreated={() => load()} />
      )}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 text-sm">Utilisateurs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-2.5 text-left font-semibold">Nom</th>
                <th className="p-2.5 text-left font-semibold">Email</th>
                <th className="p-2.5 text-left font-semibold">Rôle</th>
                <th className="p-2.5 text-left font-semibold">Casquettes</th>
                <th className="p-2.5 text-left font-semibold">MDP</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className={`border-t border-slate-100 ${isDisabledRole(p.role) ? 'bg-red-50/60' : ''}`}>
                  <td className="p-2.5 font-medium text-slate-800">{p.display_name || '—'}</td>
                  <td className="p-2.5 text-slate-500">{p.email || '—'}</td>
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
                  <td className="p-2.5">
                    <div className="flex flex-wrap gap-2">
                      {activeCasquettes.map((c) => {
                        const on = (profileCasqMap[p.id] || []).includes(c.id);
                        return (
                          <label key={c.id} className="inline-flex items-center gap-1 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1">
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={!isAppAdministrateur || isDisabledRole(p.role)}
                              onChange={(e) => handleProfileCasquettes(p.id, c.id, e.target.checked)}
                            />
                            {c.label}
                          </label>
                        );
                      })}
                      {!activeCasquettes.length && <span className="text-xs text-slate-400">Aucune</span>}
                    </div>
                  </td>
                  <td className="p-2.5 text-xs">
                    {p.must_change_password
                      ? <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Temporaire</span>
                      : <span className="text-slate-400">OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-xs text-slate-500 border-t border-slate-100">
          Désactivé = connexion refusée. Casquettes surtout utiles pour les préparateurs.
          « Temporaire » = changement de mot de passe exigé à la prochaine connexion.
        </p>
      </div>
      </>
      )}

      {pageTab === 'casquettes' && (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 text-sm">Casquettes (catalogue)</h2>
        </div>
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 mb-2">Sélectionner une casquette</p>
            <ul className="space-y-1 mb-4">
              {casquettes.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedCasquetteId(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${
                      selectedCasquetteId === c.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'
                    } ${!c.active ? 'opacity-60' : ''}`}
                  >
                    <span className="font-medium">{c.label}</span>
                    <span className="text-slate-400 ml-2 text-xs">{c.slug}</span>
                    {!c.active && <span className="ml-2 text-[10px] uppercase text-amber-600">off</span>}
                  </button>
                </li>
              ))}
            </ul>
            {selectedCasquette && (
              <label className="flex items-center gap-2 text-sm mb-4">
                <input
                  type="checkbox"
                  checked={!!selectedCasquette.active}
                  disabled={!isAppAdministrateur}
                  onChange={(e) => handleToggleCasquetteActive(selectedCasquette.id, e.target.checked)}
                />
                Active
              </label>
            )}
            <form onSubmit={handleCreateCasquette} className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold text-slate-600 uppercase">Nouvelle casquette</p>
              <input
                required
                placeholder="slug (ex. mds)"
                value={newCasq.slug}
                disabled={!isAppAdministrateur}
                onChange={(e) => setNewCasq({ ...newCasq, slug: e.target.value })}
                className="w-full text-sm border rounded-lg px-2 py-1.5"
              />
              <input
                required
                placeholder="Libellé"
                value={newCasq.label}
                disabled={!isAppAdministrateur}
                onChange={(e) => setNewCasq({ ...newCasq, label: e.target.value })}
                className="w-full text-sm border rounded-lg px-2 py-1.5"
              />
              <input
                placeholder="Description"
                value={newCasq.description}
                disabled={!isAppAdministrateur}
                onChange={(e) => setNewCasq({ ...newCasq, description: e.target.value })}
                className="w-full text-sm border rounded-lg px-2 py-1.5"
              />
              <button
                type="submit"
                disabled={!isAppAdministrateur}
                className="bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                Créer
              </button>
            </form>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-2">
              Features (taskbar + dashboard) — catalogue fixe ; pas de nouveau module sans code.
            </p>
            {!selectedCasquetteId && <p className="text-sm text-slate-400">Choisir une casquette.</p>}
            {selectedCasquetteId && (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">Taskbar</p>
                  <div className="flex flex-wrap gap-2">
                    {TASKBAR_FEATURES.map((f) => {
                      const on = selectedFeatureKeys.has(`taskbar|${f.id}`);
                      return (
                        <label key={f.id} className="inline-flex items-center gap-1 text-xs border rounded px-2 py-1">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={!isAppAdministrateur}
                            onChange={(e) => handleToggleCasquetteFeature('taskbar', f.id, e.target.checked)}
                          />
                          {f.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">Dashboard</p>
                  <div className="flex flex-wrap gap-2">
                    {DASHBOARD_FEATURES.map((f) => {
                      const on = selectedFeatureKeys.has(`dashboard|${f.id}`);
                      return (
                        <label key={f.id} className="inline-flex items-center gap-1 text-xs border rounded px-2 py-1">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={!isAppAdministrateur}
                            onChange={(e) => handleToggleCasquetteFeature('dashboard', f.id, e.target.checked)}
                          />
                          {f.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {pageTab === 'modules' && (
      <div>
      <MatrixTable
        title="Modules — missions taskbar"
        surface="taskbar"
        features={TASKBAR_FEATURES}
        overrides={overrides}
        onToggle={handleToggle}
        disabled={!isAppAdministrateur}
      />
      <MatrixTable
        title="Modules — pages dashboard"
        surface="dashboard"
        features={DASHBOARD_FEATURES}
        overrides={overrides}
        onToggle={handleToggle}
        disabled={!isAppAdministrateur}
      />
      </div>
      )}

      {pageTab === 'widgets' && (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 text-sm">Accueil dashboard — widgets</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Module et catégorie d&apos;utilité servent aussi de filtres sur la vue d&apos;ensemble.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-2.5 text-left font-semibold">Widget</th>
                <th className="p-2.5 text-left font-semibold">Module</th>
                <th className="p-2.5 text-left font-semibold">Catégorie</th>
                {ACCESS_ROLES.map((role) => (
                  <th key={role} className="p-2.5 text-center font-semibold">{ROLE_LABELS[role]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DASHBOARD_WIDGETS.map((w) => (
                <tr key={w.id} className="border-t border-slate-100">
                  <td className="p-2.5 text-slate-700">{w.label}</td>
                  <td className="p-2.5 text-slate-500 text-xs">
                    {DASHBOARD_MODULES.find((m) => m.id === w.module)?.label || w.module}
                  </td>
                  <td className="p-2.5 text-slate-500 text-xs">
                    {DASHBOARD_CATEGORIES.find((c) => c.id === w.category)?.label || w.category}
                  </td>
                  {ACCESS_ROLES.map((role) => {
                    const on = widgetVisible(role, w.id);
                    return (
                      <td key={role} className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!isAppAdministrateur}
                          onChange={() => handleWidgetToggle(role, w.id, !on)}
                          className="w-4 h-4 accent-sky-600"
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
      )}

      {pageTab === 'taches' && (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 text-sm">Assignation des tâches</h2>
          <p className="text-xs text-slate-500 mt-1">
            Jamais / Immédiat / Après délai (+ heures). Survolez l’icône ? pour le détail de chaque tâche.
          </p>
        </div>
        <div className="px-3 flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50/50">
          {TASK_MODULES.map((mod) => {
            const count = taskCategoriesForModule(mod.id).length;
            if (!count) return null;
            const active = taskModuleTab === mod.id;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => setTaskModuleTab(mod.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-sm rounded-t-lg border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-slate-800 text-slate-900 font-semibold bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/70'
                }`}
              >
                {mod.label}
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/80 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-2.5 text-left font-semibold">Tâche</th>
                {ACCESS_ROLES.map((role) => (
                  <th key={role} className="p-2.5 text-center font-semibold">{ROLE_LABELS[role]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {taskCatsForTab.map((cat) => (
                <tr key={cat.id} className="border-t border-slate-100">
                  <td className="p-2.5 text-slate-700">
                    <div className="flex items-start gap-1.5">
                      <span>{cat.label}</span>
                      <span
                        className="inline-flex text-slate-400 hover:text-sky-600 cursor-help shrink-0 mt-0.5"
                        title={cat.description}
                        aria-label={cat.description}
                      >
                        <HelpCircle size={14} />
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{cat.id}</p>
                  </td>
                  {ACCESS_ROLES.map((role) => {
                    const rule = taskRule(cat.id, role);
                    return (
                      <td key={role} className="p-2.5 text-center align-top">
                        <select
                          value={rule.mode || 'never'}
                          disabled={!isAppAdministrateur}
                          onChange={(e) => handleTaskRule(cat.id, role, e.target.value, rule.delay_hours || 24)}
                          className="text-xs border rounded px-1 py-1 mb-1"
                        >
                          {TASK_MODES.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                        {(rule.mode === 'after_delay') && (
                          <input
                            type="number"
                            min={1}
                            step={1}
                            disabled={!isAppAdministrateur}
                            value={rule.delay_hours ?? 24}
                            onChange={(e) => handleTaskRule(cat.id, role, 'after_delay', e.target.value)}
                            className="w-16 text-xs border rounded px-1 py-0.5"
                            title="Délai (heures)"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!taskCatsForTab.length && (
                <tr>
                  <td colSpan={1 + ACCESS_ROLES.length} className="p-4 text-sm text-slate-400 text-center">
                    Aucune tâche dans ce module.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
