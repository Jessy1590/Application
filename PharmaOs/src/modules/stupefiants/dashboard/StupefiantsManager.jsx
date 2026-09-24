import React, { useState, useEffect, useCallback } from 'react';
import { Lock, ExternalLink, Save, Trash2, Pencil, X } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { useRealtimeRefresh } from '../../../shared/useRealtimeRefresh.js';
import StupefiantReceptionForm, {
  EMPTY_RECEPTION_FORM,
  StupefiantReceptionSummary,
} from '../shared/StupefiantReceptionForm.jsx';
import {
  fetchReleves,
  fetchLivreurs,
  fetchStaffProfiles,
  submitRecount,
  submitAnalyse,
  updateReleve,
  deleteReleve,
  getBlSignedUrl,
  declareReception,
  closeErreurReception,
  STUPEFIANT_STATUS_LABELS,
  CLOSED_STATUSES,
  formatLivreurLabel,
} from '../services/stupefiantService.js';

const STATUS_FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'en_attente', label: 'En attente' },
  { id: 'a_verifier', label: 'À vérifier' },
  { id: 'analyse', label: 'Analyse' },
  { id: 'ras', label: 'RAS' },
  { id: 'ras_recompte', label: 'RAS recompte' },
  { id: 'corrige_compris', label: 'Corrigé compris' },
  { id: 'corrige_sans', label: 'Corrigé sans cause' },
  { id: 'erreur_reception', label: 'Err. réception' },
];

const inputCls = 'w-full p-2 border border-slate-300 rounded-lg text-sm';

function formatFrDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR');
  } catch {
    return '—';
  }
}

function DetailRow({ label, children }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-1 border-b border-slate-100 last:border-0">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-800 text-right">{children}</span>
    </div>
  );
}

function StockPairInputs({ labels, values, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="block text-xs font-semibold mb-1">{labels[0]}</label>
        <input
          type="number"
          min={0}
          value={values[0] ?? ''}
          onChange={(e) => onChange(0, e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1">{labels[1]}</label>
        <input
          type="number"
          min={0}
          value={values[1] ?? ''}
          onChange={(e) => onChange(1, e.target.value)}
          className={inputCls}
        />
      </div>
    </div>
  );
}

/**
 * @param {{ onNavigate?: Function, focusReleveId?: string|null, initialTab?: string|null }} props
 */
export default function StupefiantsManager({
  onNavigate,
  focusReleveId = null,
  initialTab = null,
}) {
  const { user, profile, canAccess } = useAuth();
  const canManage = canAccess('dashboard', 'stupefiants');
  const [rows, setRows] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState(() => {
    if (initialTab === 'verifier' || focusReleveId) return 'verifier';
    if (initialTab === 'liste') return 'liste';
    return 'verifier';
  });
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(focusReleveId);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [allowReceptionEdit, setAllowReceptionEdit] = useState(false);

  const [recountForm, setRecountForm] = useState({
    recompte_boites: '', recompte_unites: '',
    stock_lgo_boites: '', stock_lgo_unites: '',
  });
  const [analyseForm, setAnalyseForm] = useState({
    mode: 'corrige_compris',
    commentaire_analyse: '',
    responsable_erreur_id: '',
    responsable_erreur_label: '',
    stock_corrige_boites: '',
    stock_corrige_unites: '',
  });
  const [editForm, setEditForm] = useState(null);
  const [listeEditing, setListeEditing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_RECEPTION_FORM });
  const [createBl, setCreateBl] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [releves, livs, profiles] = await Promise.all([
        fetchReleves(),
        fetchLivreurs(),
        fetchStaffProfiles(),
      ]);
      setRows(releves);
      setLivreurs(livs);
      setStaff(profiles);
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(load, { tables: ['stupefiant_releves', 'directory_contacts', 'tasks', 'task_assignments'] });

  const openDirectory = useCallback(() => {
    if (typeof onNavigate === 'function') onNavigate('directory');
  }, [onNavigate]);

  useEffect(() => {
    if (focusReleveId) {
      setSelectedId(focusReleveId);
      setMainTab('verifier');
    }
  }, [focusReleveId]);

  useEffect(() => {
    if (initialTab === 'verifier' || initialTab === 'liste') setMainTab(initialTab);
  }, [initialTab]);

  const selected = rows.find((r) => r.id === selectedId) || null;

  useEffect(() => {
    const id = selected?.livreur_id;
    if (!id) return undefined;
    let cancelled = false;
    fetchLivreurs({ includeId: id })
      .then((livs) => { if (!cancelled) setLivreurs(livs); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selected?.livreur_id]);

  useEffect(() => {
    setAllowReceptionEdit(false);
    setListeEditing(false);
    if (!selected) {
      setEditForm(null);
      return;
    }
    setEditForm({
      medicament: selected.medicament || '',
      cip: selected.cip || '',
      produit_hors_bdm: !!selected.produit_hors_bdm,
      nb_boites_recues: selected.nb_boites_recues ?? '',
      livreur_id: selected.livreur_id || '',
      is_du: !!selected.is_du,
      du_patient_label: selected.du_patient_label || '',
      du_unites_promisees: selected.du_unites_promisees ?? '',
      armoire_boites: selected.armoire_boites ?? selected.stock_visuel_boites ?? '',
      armoire_unites: selected.armoire_unites ?? selected.stock_visuel_unites ?? '',
      stock_visuel_boites: selected.stock_visuel_boites ?? selected.armoire_boites ?? '',
      stock_visuel_unites: selected.stock_visuel_unites ?? selected.armoire_unites ?? '',
      stock_lgo_boites: selected.stock_lgo_boites ?? '',
      stock_lgo_unites: selected.stock_lgo_unites ?? '',
      bl_numero: selected.bl_numero || '',
      notes: selected.notes || '',
    });
    setRecountForm({
      recompte_boites: selected.recompte_boites ?? '',
      recompte_unites: selected.recompte_unites ?? '',
      stock_lgo_boites: selected.stock_lgo_boites ?? '',
      stock_lgo_unites: selected.stock_lgo_unites ?? '',
    });
    setAnalyseForm({
      mode: 'corrige_compris',
      commentaire_analyse: selected.commentaire_analyse || '',
      responsable_erreur_id: selected.responsable_erreur_id || '',
      responsable_erreur_label: selected.responsable_erreur_label || '',
      stock_corrige_boites: selected.stock_corrige_boites ?? '',
      stock_corrige_unites: selected.stock_corrige_unites ?? '',
    });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingVerify = rows.filter((r) => r.status === 'a_verifier' || r.status === 'recompter' || r.status === 'analyse');

  const filtered = rows.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        (r.medicament || '').toLowerCase().includes(q)
        || (r.cip || '').toLowerCase().includes(q)
        || (r.bl_numero || '').toLowerCase().includes(q)
        || (r.author_name || '').toLowerCase().includes(q)
        || (r.livreur_label || '').toLowerCase().includes(q)
        || (r.directory_contacts?.nom || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openBl = async (path) => {
    try {
      const url = await getBlSignedUrl(path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      alert(e.message);
    }
  };

  const run = async (fn) => {
    setMsg('');
    setErr('');
    try {
      await fn();
      setMsg('Enregistré.');
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const saveListeEdit = () => {
    if (!selected || !editForm) return;
    const armoireBoites = editForm.stock_visuel_boites === '' && editForm.armoire_boites === ''
      ? null
      : parseInt(editForm.stock_visuel_boites ?? editForm.armoire_boites, 10);
    const armoireUnites = editForm.stock_visuel_unites === '' && editForm.armoire_unites === ''
      ? null
      : parseInt(editForm.stock_visuel_unites ?? editForm.armoire_unites, 10);
    return run(async () => {
      await updateReleve(selected.id, {
        medicament: (editForm.medicament || '').trim(),
        cip: (editForm.cip || '').trim() || null,
        produit_hors_bdm: !!editForm.produit_hors_bdm,
        nb_boites_recues: parseInt(editForm.nb_boites_recues, 10) || 0,
        livreur_id: editForm.livreur_id || null,
        is_du: !!editForm.is_du,
        du_patient_label: editForm.is_du
          ? ((editForm.du_patient_label || '').trim() || null)
          : null,
        du_unites_promisees: editForm.is_du
          ? (editForm.du_unites_promisees === '' ? null : parseInt(editForm.du_unites_promisees, 10))
          : null,
        armoire_boites: Number.isNaN(armoireBoites) ? null : armoireBoites,
        armoire_unites: Number.isNaN(armoireUnites) ? null : armoireUnites,
        stock_visuel_boites: Number.isNaN(armoireBoites) ? null : armoireBoites,
        stock_visuel_unites: Number.isNaN(armoireUnites) ? null : armoireUnites,
        stock_lgo_boites: editForm.stock_lgo_boites === ''
          ? null
          : parseInt(editForm.stock_lgo_boites, 10),
        stock_lgo_unites: editForm.stock_lgo_unites === ''
          ? null
          : parseInt(editForm.stock_lgo_unites, 10),
        bl_numero: (editForm.bl_numero || '').trim() || null,
        notes: (editForm.notes || '').trim() || null,
      });
      setListeEditing(false);
    });
  };

  if (loading && rows.length === 0) {
    return <div className="p-8 text-slate-500">Chargement…</div>;
  }

  const verifyPanel = selected && (
    <div className="space-y-4">
      <StupefiantReceptionSummary releve={selected} onOpenBl={openBl} />

      {canManage && (selected.status === 'a_verifier' || selected.status === 'recompter' || selected.status === 'analyse') && (
        <div className="flex items-center gap-2 text-sm">
          <input
            id="stu-err-rec"
            type="checkbox"
            checked={allowReceptionEdit}
            onChange={(e) => setAllowReceptionEdit(e.target.checked)}
            className="rounded border-slate-300"
          />
          <label htmlFor="stu-err-rec" className="text-amber-800 font-medium">
            Erreur de réception — autoriser la modification des infos
          </label>
        </div>
      )}

      {canManage && allowReceptionEdit && editForm && (
        <div className="space-y-3 border border-amber-200 bg-amber-50/50 rounded-xl p-3">
          <h3 className="text-sm font-semibold text-amber-900">Correction réception</h3>
          <StupefiantReceptionForm
            form={editForm}
            onChange={(p) => setEditForm((prev) => ({ ...prev, ...p }))}
            livreurs={livreurs}
            onOpenDirectory={typeof onNavigate === 'function' ? openDirectory : null}
            showCountFields={false}
            compact
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 px-3 py-2 bg-slate-800 text-white rounded-lg text-sm"
              onClick={() => run(async () => {
                await updateReleve(selected.id, {
                  ...editForm,
                  nb_boites_recues: parseInt(editForm.nb_boites_recues, 10) || 0,
                  du_unites_promisees: editForm.du_unites_promisees === '' ? null : parseInt(editForm.du_unites_promisees, 10),
                  cip: editForm.cip || null,
                });
              })}
            >
              <Save size={14} /> Sauver correction
            </button>
            <button
              type="button"
              className="px-3 py-2 bg-amber-600 text-white rounded-lg text-sm"
              onClick={() => run(async () => {
                await updateReleve(selected.id, {
                  ...editForm,
                  nb_boites_recues: parseInt(editForm.nb_boites_recues, 10) || 0,
                  cip: editForm.cip || null,
                });
                await closeErreurReception(selected.id, 'Clôturé en erreur de réception', user.id);
                setAllowReceptionEdit(false);
              })}
            >
              Clôturer erreur réception
            </button>
          </div>
        </div>
      )}

      {canManage && (selected.status === 'a_verifier' || selected.status === 'recompter') && !allowReceptionEdit && (
        <div className="space-y-3 border-t pt-3">
          <h3 className="text-sm font-semibold text-rose-800">Recomptage pharmacien</h3>
          <p className="text-xs text-slate-500">
            1er compte (réceptionnaire) : armoire {selected.stock_visuel_boites}/{selected.stock_visuel_unites}
            {' '}≠ LGO {selected.stock_lgo_boites}/{selected.stock_lgo_unites}
          </p>
          <StockPairInputs
            labels={['Recompte boîtes', 'Recompte unités']}
            values={[recountForm.recompte_boites, recountForm.recompte_unites]}
            onChange={(i, v) => setRecountForm((prev) => ({
              ...prev,
              [i === 0 ? 'recompte_boites' : 'recompte_unites']: v,
            }))}
          />
          <StockPairInputs
            labels={['LGO boîtes', 'LGO unités']}
            values={[recountForm.stock_lgo_boites, recountForm.stock_lgo_unites]}
            onChange={(i, v) => setRecountForm((prev) => ({
              ...prev,
              [i === 0 ? 'stock_lgo_boites' : 'stock_lgo_unites']: v,
            }))}
          />
          <button
            type="button"
            className="px-3 py-2 bg-rose-600 text-white rounded-lg text-sm"
            onClick={() => run(() => submitRecount(selected.id, recountForm, user.id))}
          >
            Valider le recomptage
          </button>
        </div>
      )}

      {canManage && selected.status === 'analyse' && !allowReceptionEdit && (
        <div className="space-y-3 border-t pt-3">
          <h3 className="text-sm font-semibold text-violet-800">Analyse / découverte du souci</h3>
          <div className="flex gap-3 text-sm">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                checked={analyseForm.mode === 'corrige_compris'}
                onChange={() => setAnalyseForm((p) => ({ ...p, mode: 'corrige_compris' }))}
              />
              Corrigé avec compréhension
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                checked={analyseForm.mode === 'corrige_sans'}
                onChange={() => setAnalyseForm((p) => ({ ...p, mode: 'corrige_sans' }))}
              />
              Corrigé sans cause
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Commentaire *</label>
            <textarea
              rows={4}
              value={analyseForm.commentaire_analyse}
              onChange={(e) => setAnalyseForm((p) => ({ ...p, commentaire_analyse: e.target.value }))}
              className={inputCls}
              placeholder="Décrire l’analyse des ventes / cause…"
            />
          </div>
          {analyseForm.mode === 'corrige_compris' && (
            <div>
              <label className="block text-xs font-semibold mb-1">Responsable de l’erreur *</label>
              <select
                value={analyseForm.responsable_erreur_id}
                onChange={(e) => {
                  const id = e.target.value;
                  const p = staff.find((s) => s.id === id);
                  setAnalyseForm((prev) => ({
                    ...prev,
                    responsable_erreur_id: id,
                    responsable_erreur_label: p?.display_name || '',
                  }));
                }}
                className={inputCls}
              >
                <option value="">Choisir…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.display_name || s.id}</option>
                ))}
              </select>
              <input
                className={`${inputCls} mt-2`}
                placeholder="Ou nom libre…"
                value={analyseForm.responsable_erreur_id ? '' : analyseForm.responsable_erreur_label}
                disabled={!!analyseForm.responsable_erreur_id}
                onChange={(e) => setAnalyseForm((p) => ({
                  ...p,
                  responsable_erreur_label: e.target.value,
                  responsable_erreur_id: '',
                }))}
              />
            </div>
          )}
          <StockPairInputs
            labels={['Stock corrigé boîtes', 'Stock corrigé unités']}
            values={[analyseForm.stock_corrige_boites, analyseForm.stock_corrige_unites]}
            onChange={(i, v) => setAnalyseForm((prev) => ({
              ...prev,
              [i === 0 ? 'stock_corrige_boites' : 'stock_corrige_unites']: v,
            }))}
          />
          <button
            type="button"
            className="px-3 py-2 bg-violet-600 text-white rounded-lg text-sm"
            onClick={() => run(() => submitAnalyse(selected.id, analyseForm, user.id))}
          >
            Clôturer l’analyse
          </button>
        </div>
      )}

      {CLOSED_STATUSES.has(selected.status) && selected.commentaire_analyse && (
        <div className="border-t pt-3 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Analyse</p>
          <p className="whitespace-pre-wrap mt-1">{selected.commentaire_analyse}</p>
          {selected.responsable_name && (
            <p className="text-xs mt-2">Responsable : {selected.responsable_name}</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <Lock className="text-rose-600" /> Stupéfiants
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Contrôle hors LGO — 1er comptage réceptionnaire, puis vérification pharmacien si écart.
            Livreurs = partenaires annuaire (grossiste / génériqueur / plateforme).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onNavigate?.('directory')}
            className="text-sm px-3 py-2 border rounded-lg hover:bg-slate-50"
          >
            Annuaire (livreurs)
          </button>
          {mainTab === 'liste' && (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="text-sm px-3 py-2 bg-rose-600 text-white rounded-lg"
            >
              {showCreate ? 'Fermer' : 'Nouvelle réception'}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[
          { id: 'verifier', label: `Vérifier${pendingVerify.length ? ` (${pendingVerify.length})` : ''}` },
          { id: 'liste', label: 'Tous les relevés' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMainTab(t.id)}
            className={`px-4 py-2 text-sm rounded-t-lg border-b-2 -mb-px ${
              mainTab === t.id
                ? 'border-rose-600 text-rose-800 font-semibold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}

      {mainTab === 'verifier' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {pendingVerify.length === 0 && (
              <p className="text-sm text-slate-400">Aucune vérification en attente.</p>
            )}
            {pendingVerify.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={`w-full text-left bg-white border rounded-xl p-3 text-sm ${
                  selectedId === r.id ? 'border-rose-400 ring-1 ring-rose-200' : 'hover:border-slate-300'
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{r.medicament}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 shrink-0">
                    {STUPEFIANT_STATUS_LABELS[r.status] || r.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {r.livreur_label && r.livreur_label !== '—' ? `${r.livreur_label} · ` : ''}
                  {r.author_name} · armoire {r.stock_visuel_boites}/{r.stock_visuel_unites}
                  {' ≠ '}LGO {r.stock_lgo_boites}/{r.stock_lgo_unites}
                </p>
              </button>
            ))}
          </div>
          <div className="bg-white border rounded-xl p-4 min-h-[280px]">
            {!selected || !pendingVerify.some((r) => r.id === selected.id) ? (
              <p className="text-sm text-slate-400">Sélectionnez un relevé à vérifier.</p>
            ) : verifyPanel}
          </div>
        </div>
      )}

      {mainTab === 'liste' && (
        <>
          {showCreate && (
            <div className="bg-white border rounded-xl p-4 max-w-2xl space-y-3">
              <h2 className="font-semibold">Nouvelle réception</h2>
              <StupefiantReceptionForm
                form={createForm}
                onChange={(p) => setCreateForm((prev) => ({ ...prev, ...p }))}
                livreurs={livreurs}
                operatorName={profile?.display_name || ''}
                blFile={createBl}
                onBlFile={setCreateBl}
                onOpenDirectory={typeof onNavigate === 'function' ? openDirectory : null}
                compact
                showCountFields
              />
              <button
                type="button"
                disabled={livreurs.length === 0}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm disabled:opacity-60"
                onClick={() => run(async () => {
                  await declareReception(user.id, createForm, createBl);
                  setCreateForm({ ...EMPTY_RECEPTION_FORM });
                  setCreateBl(null);
                  setShowCreate(false);
                })}
              >
                Valider réception + comptage
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-center">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`text-xs px-2.5 py-1.5 rounded-full border ${
                  statusFilter === f.id ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600'
                }`}
              >
                {f.label}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Recherche…"
              className="ml-auto text-sm p-2 border rounded-lg w-56"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
              {filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left bg-white border rounded-xl p-3 text-sm ${
                    selectedId === r.id ? 'border-rose-400 ring-1 ring-rose-200' : 'hover:border-slate-300'
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{r.medicament}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded shrink-0 ${
                      CLOSED_STATUSES.has(r.status) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                    }`}>
                      {STUPEFIANT_STATUS_LABELS[r.status] || r.status}
                    </span>
                  </div>
                  <p className="text-slate-600 mt-1 text-xs">
                    {r.nb_boites_recues} boîte(s)
                    {r.livreur_label && r.livreur_label !== '—' ? ` · ${r.livreur_label}` : ''}
                    {' — '}BL {r.bl_numero} · {r.author_name}
                  </p>
                </button>
              ))}
            </div>
            <div className="bg-white border rounded-xl p-4 min-h-[280px] max-h-[70vh] overflow-y-auto">
              {!selected ? (
                <p className="text-sm text-slate-400">Sélectionnez un relevé.</p>
              ) : listeEditing && editForm && canManage ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-bold text-slate-800">Modifier le relevé</h2>
                    <button
                      type="button"
                      className="text-xs text-slate-500 inline-flex items-center gap-1 hover:text-slate-800"
                      onClick={() => setListeEditing(false)}
                    >
                      <X size={14} /> Annuler
                    </button>
                  </div>
                  <StupefiantReceptionForm
                    form={editForm}
                    onChange={(p) => setEditForm((prev) => ({ ...prev, ...p }))}
                    livreurs={livreurs}
                    onOpenDirectory={typeof onNavigate === 'function' ? openDirectory : null}
                    showCountFields
                    compact
                  />
                  <div>
                    <label className="block text-xs font-semibold mb-1">Notes</label>
                    <textarea
                      rows={3}
                      value={editForm.notes || ''}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                      className={inputCls}
                      placeholder="Notes internes…"
                    />
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-3 py-2 bg-slate-800 text-white rounded-lg text-sm"
                    onClick={saveListeEdit}
                  >
                    <Save size={14} /> Enregistrer
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-bold text-slate-800">{selected.medicament}</h2>
                      <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded ${
                        CLOSED_STATUSES.has(selected.status)
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-800'
                      }`}>
                        {STUPEFIANT_STATUS_LABELS[selected.status] || selected.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selected.bl_path && (
                        <button
                          type="button"
                          onClick={() => openBl(selected.bl_path)}
                          className="text-xs text-sky-700 inline-flex items-center gap-1"
                        >
                          <ExternalLink size={12} /> BL
                        </button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className="text-xs px-2 py-1 border rounded-lg inline-flex items-center gap-1 hover:bg-slate-50"
                          onClick={() => setListeEditing(true)}
                        >
                          <Pencil size={12} /> Modifier
                        </button>
                      )}
                    </div>
                  </div>

                  <StupefiantReceptionSummary releve={selected} onOpenBl={openBl} />

                  <div className="rounded-xl border border-slate-200 p-3 space-y-0.5">
                    <DetailRow label="Statut">
                      {STUPEFIANT_STATUS_LABELS[selected.status] || selected.status}
                    </DetailRow>
                    <DetailRow label="Livreur">
                      {selected.livreur_label || formatLivreurLabel(selected)}
                    </DetailRow>
                    <DetailRow label="CIP">{selected.cip || '—'}</DetailRow>
                    <DetailRow label="Boîtes reçues">{selected.nb_boites_recues ?? '—'}</DetailRow>
                    <DetailRow label="N° BL">{selected.bl_numero || '—'}</DetailRow>
                    {selected.produit_hors_bdm && (
                      <DetailRow label="Référentiel">Hors BDPM</DetailRow>
                    )}
                    {selected.is_du && (
                      <>
                        <DetailRow label="Dû patient">{selected.du_patient_label || '—'}</DetailRow>
                        <DetailRow label="Unités promises">
                          {selected.du_unites_promisees ?? '—'}
                        </DetailRow>
                      </>
                    )}
                    <DetailRow label="Armoire">
                      {selected.stock_visuel_boites ?? '—'}/{selected.stock_visuel_unites ?? '—'}
                    </DetailRow>
                    <DetailRow label="LGO">
                      {selected.stock_lgo_boites ?? '—'}/{selected.stock_lgo_unites ?? '—'}
                    </DetailRow>
                    {(selected.recompte_boites != null || selected.recompte_unites != null) && (
                      <DetailRow label="Recompte pharma.">
                        {selected.recompte_boites ?? '—'}/{selected.recompte_unites ?? '—'}
                      </DetailRow>
                    )}
                    {(selected.stock_corrige_boites != null || selected.stock_corrige_unites != null) && (
                      <DetailRow label="Stock corrigé">
                        {selected.stock_corrige_boites ?? '—'}/{selected.stock_corrige_unites ?? '—'}
                      </DetailRow>
                    )}
                    <DetailRow label="Réceptionnaire">{selected.author_name || '—'}</DetailRow>
                    <DetailRow label="Créé le">{formatFrDate(selected.created_at)}</DetailRow>
                    {selected.verifier_name && (
                      <DetailRow label="Vérifié par">{selected.verifier_name}</DetailRow>
                    )}
                    {selected.verified_at && (
                      <DetailRow label="Vérifié le">{formatFrDate(selected.verified_at)}</DetailRow>
                    )}
                    {selected.closed_at && (
                      <DetailRow label="Clôturé le">{formatFrDate(selected.closed_at)}</DetailRow>
                    )}
                  </div>

                  {selected.notes && (
                    <div className="text-sm">
                      <p className="font-semibold text-slate-800">Notes</p>
                      <p className="whitespace-pre-wrap text-slate-600 mt-1">{selected.notes}</p>
                    </div>
                  )}

                  {selected.commentaire_analyse && (
                    <div className="text-sm border-t pt-3">
                      <p className="font-semibold text-slate-800">Analyse</p>
                      <p className="whitespace-pre-wrap text-slate-600 mt-1">{selected.commentaire_analyse}</p>
                      {selected.responsable_name && (
                        <p className="text-xs mt-2 text-slate-500">
                          Responsable : {selected.responsable_name}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {!CLOSED_STATUSES.has(selected.status) && (
                      <button
                        type="button"
                        className="text-sm text-rose-700 underline"
                        onClick={() => setMainTab('verifier')}
                      >
                        Ouvrir dans Vérifier →
                      </button>
                    )}
                    {canManage && CLOSED_STATUSES.has(selected.status) && (
                      <button
                        type="button"
                        className="text-xs text-red-600 border border-red-200 px-2 py-1 rounded inline-flex items-center gap-1"
                        onClick={() => {
                          if (!confirm('Supprimer ce relevé ?')) return;
                          run(async () => {
                            await deleteReleve(selected.id);
                            setSelectedId(null);
                          });
                        }}
                      >
                        <Trash2 size={12} /> Supprimer
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
