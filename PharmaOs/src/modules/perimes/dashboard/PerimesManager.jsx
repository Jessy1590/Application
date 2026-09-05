import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Package, CheckCircle2, Scale, HeartHandshake, Sparkles, Tag,
  MapPin, Settings2, Trophy,
} from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  fetchPerimes,
  ensureAllPerimeTasks,
  applyValorisation,
  applyLaisserPerimer,
  fetchEmplacements,
  createEmplacement,
  updateEmplacement,
  deleteEmplacement,
  splitTracking,
  PERIME_STATUS_LABELS,
} from '../services/perimesService.js';
import { openModuleWindow } from '../../../shared/windowService.js';

const FILTERS = [
  { id: 'a_decider', label: 'À décider' },
  { id: 'declare', label: 'Déclarés' },
  { id: 'valorise', label: 'Valorisés' },
  { id: 'laisser_perimer', label: 'Laisser périmer' },
  { id: 'litige', label: 'Litige' },
  { id: 'association', label: 'Association' },
  { id: 'all', label: 'Tous' },
];

const STATUS_COLORS = {
  declare: 'bg-slate-100 text-slate-700',
  a_decider: 'bg-amber-100 text-amber-800',
  valorise: 'bg-emerald-100 text-emerald-800',
  laisser_perimer: 'bg-orange-100 text-orange-800',
  litige: 'bg-sky-100 text-sky-800',
  association: 'bg-violet-100 text-violet-800',
  clos: 'bg-slate-200 text-slate-500',
};

const emptyDecision = {
  mise_en_avant: false,
  mise_en_avant_debut: '',
  mise_en_avant_fin: '',
  mise_en_avant_emplacement: '',
  mise_en_avant_montant: '',
  mise_en_avant_message: '',
  promo: false,
  promo_debut: '',
  promo_fin: '',
  promo_emplacement: '',
  promo_montant: '',
  promo_message: '',
  challenge: false,
  challenge_titre: '',
  challenge_objectif: '',
  challenge_fin: '',
  challenge_message: '',
  asso_notes: '',
};

function TrackingCard({ title, icon: Icon, items, empty, renderExtra }) {
  return (
    <div className="bg-white rounded-xl border p-4 min-h-[140px]">
      <h3 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
        {Icon && <Icon size={14} className="text-orange-600" />}
        {title}
        <span className="text-slate-400 font-normal">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li key={p.id} className="text-xs border-b border-slate-100 pb-2 last:border-0">
              <p className="font-semibold text-slate-800">{p.medicament}</p>
              {renderExtra?.(p)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PerimesManager({ onNavigate }) {
  const { user, profile } = useAuth();
  const [items, setItems] = useState([]);
  const [emplacements, setEmplacements] = useState([]);
  const [filter, setFilter] = useState('declare');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [deciding, setDeciding] = useState(null);
  const [form, setForm] = useState(emptyDecision);
  const [saving, setSaving] = useState(false);
  const [showEmplacements, setShowEmplacements] = useState(false);
  const [newEmpLabel, setNewEmpLabel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      await ensureAllPerimeTasks(user?.id);
      const [perimes, emps] = await Promise.all([
        fetchPerimes(),
        fetchEmplacements(),
      ]);
      setItems(perimes);
      setEmplacements(emps);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const tracking = useMemo(() => splitTracking(items), [items]);
  const activeEmps = emplacements.filter((e) => e.actif);

  const displayed = filter === 'all'
    ? items
    : items.filter((p) => p.status === filter);

  const openDecision = (p) => {
    setDeciding(p);
    setForm(emptyDecision);
    setMsg('');
    setErr('');
  };

  const displayName = profile?.display_name || user?.email;

  const handleValoriser = async () => {
    setSaving(true);
    setErr('');
    try {
      await applyValorisation(
        deciding.id,
        {
          mise_en_avant: form.mise_en_avant,
          mise_en_avant_debut: form.mise_en_avant_debut || null,
          mise_en_avant_fin: form.mise_en_avant_fin || null,
          mise_en_avant_emplacement: form.mise_en_avant_emplacement || null,
          mise_en_avant_montant: form.mise_en_avant_montant,
          mise_en_avant_message: form.mise_en_avant_message,
          promo: form.promo,
          promo_debut: form.promo_debut || null,
          promo_fin: form.promo_fin || null,
          promo_emplacement: form.promo_emplacement || null,
          promo_montant: form.promo_montant,
          promo_message: form.promo_message,
          challenge: form.challenge
            ? {
              actif: true,
              titre: form.challenge_titre,
              objectif: form.challenge_objectif,
              fin: form.challenge_fin,
              message: form.challenge_message,
            }
            : null,
        },
        user.id,
        displayName,
      );
      setMsg('Valorisation enregistrée. Les tâches équipe partiront à J−3 mois (ou immédiatement si déjà dû).');
      setDeciding(null);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAssociation = async () => {
    setSaving(true);
    setErr('');
    try {
      await applyLaisserPerimer(
        deciding.id,
        'association',
        user.id,
        displayName,
        form.asso_notes || deciding.notes,
      );
      setMsg('Périmé marqué pour association.');
      setDeciding(null);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLitige = async () => {
    setSaving(true);
    setErr('');
    try {
      const updated = await applyLaisserPerimer(
        deciding.id,
        'litige',
        user.id,
        displayName,
      );
      setMsg('Décision enregistrée — ouverture du litige…');
      setDeciding(null);
      await load();
      openModuleWindow('disputes', {
        fromPerime: true,
        perime_id: updated.id,
        medicament: updated.medicament,
        code: updated.code,
        cip: updated.cip,
        lot: updated.lot,
        date_peremption: updated.date_peremption,
        quantite: updated.quantite,
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const addEmplacement = async () => {
    if (!newEmpLabel.trim()) return;
    try {
      await createEmplacement(newEmpLabel);
      setNewEmpLabel('');
      setEmplacements(await fetchEmplacements());
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Chargement…</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className="flex items-center gap-2 text-slate-500 hover:text-orange-600 mb-6 text-sm font-medium"
      >
        <ArrowLeft size={16} /> Retour
      </button>

      <div className="flex justify-between items-start mb-2 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="text-orange-600" /> Périmés — décisions & suivi
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Décidez dès la déclaration. Les tâches équipe (MEA / promo / challenge) partent à J−3 mois.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowEmplacements((v) => !v)}
          className="text-sm px-3 py-2 border rounded-lg flex items-center gap-2 hover:bg-slate-50"
        >
          <Settings2 size={16} /> Emplacements
        </button>
      </div>

      {msg && (
        <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg flex items-center gap-2">
          <CheckCircle2 size={16} /> {msg}
        </p>
      )}
      {err && !deciding && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 p-3 rounded-lg">{err}</p>
      )}

      {showEmplacements && (
        <div className="mb-6 bg-white border rounded-xl p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <MapPin size={16} className="text-orange-600" /> Paramètres — emplacements
          </h2>
          <div className="flex gap-2 mb-3">
            <input
              value={newEmpLabel}
              onChange={(e) => setNewEmpLabel(e.target.value)}
              placeholder="Nouvel emplacement"
              className="flex-1 p-2 border rounded-lg text-sm"
            />
            <button type="button" onClick={addEmplacement} className="px-3 py-2 bg-orange-600 text-white rounded-lg text-sm">
              Ajouter
            </button>
          </div>
          <ul className="space-y-2">
            {emplacements.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className={`flex-1 ${e.actif ? '' : 'line-through text-slate-400'}`}>{e.label}</span>
                <button
                  type="button"
                  onClick={async () => {
                    await updateEmplacement(e.id, { actif: !e.actif });
                    setEmplacements(await fetchEmplacements());
                  }}
                  className="text-xs px-2 py-1 border rounded"
                >
                  {e.actif ? 'Désactiver' : 'Activer'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('Supprimer cet emplacement ?')) return;
                    await deleteEmplacement(e.id);
                    setEmplacements(await fetchEmplacements());
                  }}
                  className="text-xs px-2 py-1 text-red-600 border border-red-200 rounded"
                >
                  Suppr.
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <TrackingCard
          title="MEA en cours"
          icon={Sparkles}
          items={tracking.meaPresent}
          empty="Aucune mise en avant aujourd’hui."
          renderExtra={(p) => (
            <p className="text-slate-500">
              {p.mise_en_avant_emplacement}
              {p.mise_en_avant_montant != null ? ` · ${p.mise_en_avant_montant} €` : ''}
              {' · '}
              jusqu’au {new Date(p.mise_en_avant_fin).toLocaleDateString('fr-FR')}
            </p>
          )}
        />
        <TrackingCard
          title="MEA à venir"
          icon={Sparkles}
          items={tracking.meaFuture}
          empty="Aucune MEA future planifiée."
          renderExtra={(p) => (
            <p className="text-slate-500">
              {p.mise_en_avant_emplacement}
              {' · '}
              dès {new Date(p.mise_en_avant_debut).toLocaleDateString('fr-FR')}
            </p>
          )}
        />
        <TrackingCard
          title="Promo en cours"
          icon={Tag}
          items={tracking.promoPresent}
          empty="Aucune promo aujourd’hui."
          renderExtra={(p) => (
            <p className="text-slate-500">
              {p.promo_emplacement}
              {p.promo_montant != null ? ` · ${p.promo_montant} €` : ''}
              {' · '}
              jusqu’au {new Date(p.promo_fin).toLocaleDateString('fr-FR')}
            </p>
          )}
        />
        <TrackingCard
          title="Promo à venir"
          icon={Tag}
          items={tracking.promoFuture}
          empty="Aucune promo future."
          renderExtra={(p) => (
            <p className="text-slate-500">
              {p.promo_emplacement}
              {' · '}
              dès {new Date(p.promo_debut).toLocaleDateString('fr-FR')}
            </p>
          )}
        />
        <TrackingCard
          title="Challenges équipe en route"
          icon={Trophy}
          items={tracking.challengesEnRoute}
          empty="Aucun challenge actif."
          renderExtra={(p) => (
            <p className="text-slate-500">
              {p.challenge_titre || 'Challenge'}
              {p.challenge_fin ? ` · fin ${new Date(p.challenge_fin).toLocaleDateString('fr-FR')}` : ''}
            </p>
          )}
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              filter === f.id ? 'bg-slate-800 text-white' : 'bg-white border text-slate-600'
            }`}
          >
            {f.label}
            {f.id !== 'all' && (
              <span className="ml-1 opacity-70">
                ({items.filter((p) => p.status === f.id).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-4">Produit</th>
              <th className="p-4">DLC</th>
              <th className="p-4">J−3</th>
              <th className="p-4">Qté</th>
              <th className="p-4">Statut</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayed.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="p-4">
                  <p className="font-medium">{p.medicament}</p>
                  <p className="text-xs text-slate-500">
                    {[p.code && `Code ${p.code}`, p.cip && `CIP ${p.cip}`, p.lot && `Lot ${p.lot}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </td>
                <td className="p-4 whitespace-nowrap">
                  {new Date(p.date_peremption).toLocaleDateString('fr-FR')}
                </td>
                <td className="p-4 whitespace-nowrap text-xs text-slate-500">
                  {p.decision_due_at
                    ? new Date(p.decision_due_at).toLocaleDateString('fr-FR')
                    : '—'}
                </td>
                <td className="p-4">{p.quantite}</td>
                <td className="p-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status] || 'bg-slate-100'}`}>
                    {PERIME_STATUS_LABELS[p.status] || p.status}
                  </span>
                </td>
                <td className="p-4 text-right">
                  {(p.status === 'a_decider' || p.status === 'declare') && (
                    <button
                      type="button"
                      onClick={() => openDecision(p)}
                      className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                    >
                      Décider
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {displayed.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">Aucun produit.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {deciding && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-lg mb-1">Décision — {deciding.medicament}</h2>
            <p className="text-sm text-slate-500 mb-4">
              DLC {new Date(deciding.date_peremption).toLocaleDateString('fr-FR')}
              {deciding.decision_due_at && (
                <> · tâches équipe dès {new Date(deciding.decision_due_at).toLocaleDateString('fr-FR')}</>
              )}
            </p>
            {err && <p className="mb-3 text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}

            <div className="space-y-4 text-sm border-t pt-4">
              <h3 className="font-semibold text-emerald-800">Valoriser</h3>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.mise_en_avant}
                  onChange={(e) => setForm({ ...form, mise_en_avant: e.target.checked })}
                />
                Mise en avant
              </label>
              {form.mise_en_avant && (
                <div className="space-y-2 pl-6">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium mb-1">Début</label>
                      <input type="date" value={form.mise_en_avant_debut} onChange={(e) => setForm({ ...form, mise_en_avant_debut: e.target.value })} className="w-full p-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Fin</label>
                      <input type="date" value={form.mise_en_avant_fin} onChange={(e) => setForm({ ...form, mise_en_avant_fin: e.target.value })} className="w-full p-2 border rounded-lg" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Emplacement *</label>
                    <select
                      value={form.mise_en_avant_emplacement}
                      onChange={(e) => setForm({ ...form, mise_en_avant_emplacement: e.target.value })}
                      className="w-full p-2 border rounded-lg"
                    >
                      <option value="">— Choisir —</option>
                      {activeEmps.map((e) => <option key={e.id} value={e.label}>{e.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Montant (€) ex. -3</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.mise_en_avant_montant}
                      onChange={(e) => setForm({ ...form, mise_en_avant_montant: e.target.value })}
                      className="w-full p-2 border rounded-lg"
                      placeholder="-3"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Message pour l’équipe</label>
                    <textarea
                      rows={2}
                      value={form.mise_en_avant_message}
                      onChange={(e) => setForm({ ...form, mise_en_avant_message: e.target.value })}
                      className="w-full p-2 border rounded-lg"
                      placeholder="Consignes, emplacement précis…"
                    />
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.promo}
                  onChange={(e) => setForm({ ...form, promo: e.target.checked })}
                />
                Promotion
              </label>
              {form.promo && (
                <div className="space-y-2 pl-6">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium mb-1">Début</label>
                      <input type="date" value={form.promo_debut} onChange={(e) => setForm({ ...form, promo_debut: e.target.value })} className="w-full p-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Fin</label>
                      <input type="date" value={form.promo_fin} onChange={(e) => setForm({ ...form, promo_fin: e.target.value })} className="w-full p-2 border rounded-lg" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Emplacement *</label>
                    <select
                      value={form.promo_emplacement}
                      onChange={(e) => setForm({ ...form, promo_emplacement: e.target.value })}
                      className="w-full p-2 border rounded-lg"
                    >
                      <option value="">— Choisir —</option>
                      {activeEmps.map((e) => <option key={e.id} value={e.label}>{e.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Montant (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.promo_montant}
                      onChange={(e) => setForm({ ...form, promo_montant: e.target.value })}
                      className="w-full p-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Message pour l’équipe</label>
                    <textarea
                      rows={2}
                      value={form.promo_message}
                      onChange={(e) => setForm({ ...form, promo_message: e.target.value })}
                      className="w-full p-2 border rounded-lg"
                    />
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.challenge}
                  onChange={(e) => setForm({ ...form, challenge: e.target.checked })}
                />
                Joindre un challenge de vente équipe
              </label>
              {form.challenge && (
                <div className="space-y-2 pl-6">
                  <input
                    placeholder="Titre du challenge"
                    value={form.challenge_titre}
                    onChange={(e) => setForm({ ...form, challenge_titre: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                  <input
                    placeholder="Objectif"
                    value={form.challenge_objectif}
                    onChange={(e) => setForm({ ...form, challenge_objectif: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                  <div>
                    <label className="block text-xs font-medium mb-1">Fin du challenge</label>
                    <input type="date" value={form.challenge_fin} onChange={(e) => setForm({ ...form, challenge_fin: e.target.value })} className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Message pour l’équipe</label>
                    <textarea
                      rows={2}
                      value={form.challenge_message}
                      onChange={(e) => setForm({ ...form, challenge_message: e.target.value })}
                      className="w-full p-2 border rounded-lg"
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={saving || (!form.mise_en_avant && !form.promo)}
                onClick={handleValoriser}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg disabled:opacity-50"
              >
                Valider la valorisation
              </button>
            </div>

            <div className="space-y-3 text-sm border-t mt-6 pt-4">
              <h3 className="font-semibold text-orange-800">Laisser périmer</h3>
              <div>
                <label className="block text-xs font-medium mb-1">Notes association (optionnel)</label>
                <input
                  value={form.asso_notes}
                  onChange={(e) => setForm({ ...form, asso_notes: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                  placeholder="Association, contact…"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleLitige}
                  className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Scale size={16} /> Litige fournisseur
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleAssociation}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <HeartHandshake size={16} /> Association
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDeciding(null)}
              className="mt-4 w-full border border-slate-300 text-slate-600 py-2 rounded-lg"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
