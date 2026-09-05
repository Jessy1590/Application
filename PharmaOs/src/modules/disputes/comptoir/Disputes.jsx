import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { Scale, Save, CheckCircle2, History, Clock, X, Play } from 'lucide-react';
import {
  DISPUTE_TYPES,
  DISPUTE_FORM_DEFAULTS,
  createDispute,
  updateDispute,
  fetchMyDisputes,
  fetchPendingDisputes,
  fetchCommercialPartners,
  disputeFormHasContent,
  disputeRowToForm,
  cancelDispute,
  createPendingDisputeTask,
  completePendingDisputeTask,
  cancelPendingDisputeTask,
} from '../services/disputeService.js';
import {
  closeModuleWindow,
  setModuleBeforeCloseHandler,
} from '../../../shared/windowService.js';

function buildDescriptionFromCall(prefill) {
  return [
    prefill.contact_nom && `Contact : ${prefill.contact_nom}`,
    prefill.numero && `Tél. : ${prefill.numero}`,
    'Motif : litige fournisseur (depuis l’appel)',
    prefill.notes_appel && `\n${prefill.notes_appel}`,
  ].filter(Boolean).join('\n').trim();
}

function buildDescriptionFromPerime(prefill) {
  return [
    `Litige reprise périmé — ${prefill.medicament || 'produit'}`,
    prefill.code && `Code : ${prefill.code}`,
    prefill.cip && `CIP : ${prefill.cip}`,
    prefill.lot && `Lot : ${prefill.lot}`,
    prefill.date_peremption && `DLC : ${prefill.date_peremption}`,
    prefill.quantite != null && `Quantité : ${prefill.quantite}`,
  ].filter(Boolean).join('\n');
}

function resolveFournisseurNom(form, partners) {
  if (form.fournisseur_nom?.trim()) return form.fournisseur_nom.trim();
  const partner = partners.find((p) => p.id === form.fournisseur_id);
  return partner ? `${partner.nom}${partner.prenom ? ` — ${partner.prenom}` : ''}` : null;
}

export default function Disputes({ data: prefill }) {
  const { user, profile } = useAuth();
  const [partners, setPartners] = useState([]);
  const [history, setHistory] = useState([]);
  const [pendingList, setPendingList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [form, setForm] = useState(DISPUTE_FORM_DEFAULTS);
  const [editingId, setEditingId] = useState(null);
  const [skipAutoPending, setSkipAutoPending] = useState(false);

  const formRef = useRef(form);
  const editingIdRef = useRef(editingId);
  const partnersRef = useRef(partners);
  const skipRef = useRef(skipAutoPending);
  const userRef = useRef(user);
  const prefillRef = useRef(prefill);

  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);
  useEffect(() => { partnersRef.current = partners; }, [partners]);
  useEffect(() => { skipRef.current = skipAutoPending; }, [skipAutoPending]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { prefillRef.current = prefill; }, [prefill]);

  const loadLists = useCallback(async () => {
    if (!user?.id) return;
    const [hist, pend, parts] = await Promise.all([
      fetchMyDisputes(user.id),
      fetchPendingDisputes(user.id),
      fetchCommercialPartners(),
    ]);
    setHistory((hist || []).filter((h) => h.statut !== 'en_attente'));
    setPendingList(pend || []);
    setPartners(parts || []);
  }, [user?.id]);

  useEffect(() => { loadLists().catch((e) => setErr(e.message)); }, [loadLists]);

  useEffect(() => {
    if (!prefill?.fromCall) return;
    setForm((prev) => ({
      ...prev,
      dispute_type: prev.dispute_type || 'commande',
      fournisseur_id: prefill.contact_id || prev.fournisseur_id || '',
      fournisseur_nom: prefill.contact_nom || prev.fournisseur_nom || '',
      description: buildDescriptionFromCall(prefill) || prev.description,
      pieces: [
        prefill.numero && `Tél. appel : ${prefill.numero}`,
        prefill.call_id && `Appel #${prefill.call_id}`,
      ].filter(Boolean).join('\n') || prev.pieces,
    }));
  }, [prefill]);

  useEffect(() => {
    if (!prefill?.fromPerime) return;
    setForm((prev) => ({
      ...prev,
      dispute_type: 'perimes',
      description: buildDescriptionFromPerime(prefill) || prev.description,
      pieces: [
        prefill.cip && `CIP ${prefill.cip}`,
        prefill.lot && `Lot ${prefill.lot}`,
        prefill.code && `Code ${prefill.code}`,
        prefill.perime_id && `Périmé #${prefill.perime_id}`,
      ].filter(Boolean).join('\n') || prev.pieces,
    }));
  }, [prefill]);

  const autoSavePending = useCallback(async () => {
    if (skipRef.current) return;
    const current = formRef.current;
    if (!disputeFormHasContent(current) || !userRef.current?.id) return;
    const pref = prefillRef.current;
    const payload = {
      ...current,
      fournisseur_nom: resolveFournisseurNom(current, partnersRef.current),
      perime_id: pref?.fromPerime ? (pref.perime_id || null) : null,
    };
    if (editingIdRef.current) {
      await updateDispute(editingIdRef.current, payload, 'en_attente');
      return;
    }
    const row = await createDispute(userRef.current.id, payload, 'en_attente');
    await createPendingDisputeTask(row, userRef.current.id);
  }, []);

  useEffect(() => {
    setModuleBeforeCloseHandler(autoSavePending);
    return () => setModuleBeforeCloseHandler(null);
  }, [autoSavePending]);

  const resetForm = () => {
    setForm(DISPUTE_FORM_DEFAULTS);
    setEditingId(null);
  };

  const buildPayload = () => ({
    ...form,
    fournisseur_nom: resolveFournisseurNom(form, partners),
    perime_id: prefill?.fromPerime ? (prefill.perime_id || null) : null,
  });

  const handleValidate = async (e) => {
    e?.preventDefault?.();
    setLoading(true);
    setErr('');
    setMsg('');
    try {
      const payload = buildPayload();
      let row;
      if (editingId) {
        row = await updateDispute(editingId, payload, 'ouvert');
        await completePendingDisputeTask(editingId, profile?.display_name);
      } else {
        row = await createDispute(user.id, payload, 'ouvert');
      }
      if (prefill?.fromPerime && prefill.perime_id && row?.id) {
        const { attachDisputeToPerime } = await import('../../perimes/services/perimesService.js');
        await attachDisputeToPerime(prefill.perime_id, row.id);
      }
      setSkipAutoPending(true);
      setMsg('Litige déclaré.');
      resetForm();
      await loadLists();
      setTimeout(() => closeModuleWindow(), 800);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePending = async () => {
    setLoading(true);
    setErr('');
    setMsg('');
    try {
      const payload = buildPayload();
      if (editingId) {
        await updateDispute(editingId, payload, 'en_attente');
      } else {
        const row = await createDispute(user.id, payload, 'en_attente');
        await createPendingDisputeTask(row, user.id);
      }
      setSkipAutoPending(true);
      setMsg('Litige sauvegardé en attente.');
      resetForm();
      await loadLists();
      setTimeout(() => closeModuleWindow(), 800);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    setErr('');
    try {
      if (editingId) {
        await cancelDispute(editingId);
        await cancelPendingDisputeTask(editingId, profile?.display_name);
      }
      setSkipAutoPending(true);
      resetForm();
      setMsg(editingId ? 'Litige annulé.' : 'Saisie annulée.');
      await loadLists();
      setTimeout(() => closeModuleWindow(), 600);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  const startFinishPending = (row) => {
    setEditingId(row.id);
    setForm(disputeRowToForm(row));
    setMsg('');
    setErr('');
  };

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      <div className="w-1/2 bg-white border-r border-slate-200 p-6 overflow-y-auto">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
          <Scale className="text-amber-600" /> Litige fournisseur
        </h2>
        <p className="text-sm text-slate-500 mb-4">Déclaration rapide (commande, facture, périmé, challenge…).</p>
        {prefill?.fromCall && !editingId && (
          <div className="mb-3 p-3 bg-amber-50 text-amber-800 rounded-lg border border-amber-200 text-sm">
            Prérempli depuis l’appel{prefill.contact_nom ? ` — ${prefill.contact_nom}` : ''}.
          </div>
        )}
        {prefill?.fromPerime && !editingId && (
          <div className="mb-3 p-3 bg-orange-50 text-orange-800 rounded-lg border border-orange-200 text-sm">
            Prérempli depuis le périmé{prefill.medicament ? ` — ${prefill.medicament}` : ''}.
          </div>
        )}
        {editingId && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
            Finalisation d’un litige en attente.
          </p>
        )}
        {msg && (
          <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex gap-2 text-sm">
            <CheckCircle2 size={16} /> {msg}
          </div>
        )}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

        <form onSubmit={handleValidate} className="space-y-3 text-sm">
          <div>
            <label className="block font-semibold mb-1">Type *</label>
            <select
              required
              value={form.dispute_type}
              onChange={(e) => setForm({ ...form, dispute_type: e.target.value })}
              className="w-full p-2 border rounded-lg"
            >
              {DISPUTE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">Fournisseur (annuaire)</label>
            <select
              value={form.fournisseur_id}
              onChange={(e) => setForm({ ...form, fournisseur_id: e.target.value })}
              className="w-full p-2 border rounded-lg"
            >
              <option value="">— Libre / saisir nom —</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}{p.prenom ? ` — ${p.prenom}` : ''}
                </option>
              ))}
            </select>
          </div>
          {!form.fournisseur_id && (
            <div>
              <label className="block font-semibold mb-1">Nom fournisseur</label>
              <input
                value={form.fournisseur_nom}
                onChange={(e) => setForm({ ...form, fournisseur_nom: e.target.value })}
                className="w-full p-2 border rounded-lg"
              />
            </div>
          )}
          <div>
            <label className="block font-semibold mb-1">Montant (€)</label>
            <input
              type="number"
              step="0.01"
              value={form.montant}
              onChange={(e) => setForm({ ...form, montant: e.target.value })}
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Description *</label>
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Pièces / liens</label>
            <textarea
              rows={2}
              value={form.pieces}
              onChange={(e) => setForm({ ...form, pieces: e.target.value })}
              className="w-full p-2 border rounded-lg"
              placeholder="N° facture, URL…"
            />
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <div className="flex gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={handlePending}
                className="flex-1 bg-amber-100 text-amber-800 hover:bg-amber-200 font-bold py-3 rounded-xl flex justify-center gap-2 disabled:opacity-70"
              >
                <Clock size={18} /> Mettre en attente
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl flex justify-center gap-2 shadow-md disabled:opacity-70"
              >
                <Save size={18} /> {loading ? 'Envoi…' : 'Valider le litige'}
              </button>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleCancel}
              className="w-full border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold py-2.5 rounded-xl flex justify-center gap-2 disabled:opacity-70"
            >
              <X size={18} /> Annuler le litige
            </button>
          </div>
        </form>
      </div>

      <div className="w-1/2 bg-slate-100 p-6 overflow-y-auto space-y-8">
        <div>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-amber-800">
            <Clock className="text-amber-600" /> Litiges en attente
          </h3>
          <div className="space-y-3">
            {pendingList.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun litige en attente.</p>
            ) : (
              pendingList.map((h) => (
                <div key={h.id} className="bg-white p-4 rounded-lg border border-amber-200 shadow-sm text-sm">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold">
                      {DISPUTE_TYPES.find((t) => t.value === h.dispute_type)?.label || h.dispute_type}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(h.created_at).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <p className="text-slate-700">{h.fournisseur_nom || '—'}</p>
                  {h.montant != null && <p className="text-xs text-slate-500">{h.montant} €</p>}
                  <p className="text-slate-600 mt-1 line-clamp-2">{h.description || 'Sans description'}</p>
                  <button
                    type="button"
                    onClick={() => startFinishPending(h)}
                    className="mt-3 w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Play size={16} /> Terminer l’attente
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-700">
            <History size={18} /> Mes litiges
          </h3>
          {history.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucun litige.</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="bg-white p-4 rounded-lg border mb-3 text-sm shadow-sm">
                <div className="flex justify-between">
                  <span className="font-bold">
                    {DISPUTE_TYPES.find((t) => t.value === h.dispute_type)?.label || h.dispute_type}
                  </span>
                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded capitalize">{h.statut}</span>
                </div>
                <p className="text-slate-600 mt-1">{h.fournisseur_nom || '—'}</p>
                {h.montant != null && <p className="text-xs text-slate-500">{h.montant} €</p>}
                <p className="text-xs text-slate-400 mt-2">{new Date(h.created_at).toLocaleString('fr-FR')}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
