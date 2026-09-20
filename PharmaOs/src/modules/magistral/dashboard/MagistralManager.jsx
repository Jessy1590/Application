import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FlaskConical, Send, XCircle, Printer, ChevronLeft, ChevronRight, Package, Trash2, Shield,
} from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { isPharmacistLevel } from '../../../core/roles.js';
import MagistralOrderForm from '../shared/MagistralOrderForm.jsx';
import MagistralAdminEdit from '../shared/MagistralAdminEdit.jsx';
import MagistralReceptionCall from '../shared/MagistralReceptionCall.jsx';
import {
  MAGISTRAL_STATUTS,
  ensureSettings,
  fetchOrders,
  validateDevis,
  markInTransit,
  markArrived,
  dispenseOrder,
  closeOrder,
  reopenNonConforme,
  saveOrderFromForm,
  orderToForm,
  orderToAdminDraft,
  saveOrderAdmin,
  countAlerts,
  deleteOrder,
} from '../services/magistralService.js';
import { printFeuilleSuivi, printFicheDemande, printListeDossiers } from '../services/magistralPrint.js';

const FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'devis', label: 'Devis' },
  { id: 'attente_st', label: 'Attente ST', statuts: ['commande', 'en_transit'] },
  { id: 'a_controler', label: 'À contrôler', statuts: ['a_controler'] },
  { id: 'a_rappeler', label: 'À rappeler' },
  { id: 'a_dispenser', label: 'À dispenser', statuts: ['receptionne'] },
];

const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

/**
 * Suivi dashboard magistrales.
 * Paramètres → Administration → Paramètres (sous-onglet Préparations).
 * @param {{ onNavigate?: Function }} props
 */
export default function MagistralManager({ onNavigate: _onNavigate = null }) {
  const { user, role } = useAuth();
  const canAdminEdit = isPharmacistLevel(role);

  const [settings, setSettings] = useState(null);
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [adminMode, setAdminMode] = useState(false);
  const [adminDraft, setAdminDraft] = useState(null);
  const [adminOrdoFile, setAdminOrdoFile] = useState(null);
  const [adminLibFile, setAdminLibFile] = useState(null);
  const [adminSaving, setAdminSaving] = useState(false);
  const [alerts, setAlerts] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [sendMailOnValidate, setSendMailOnValidate] = useState(true);
  const [recvMode, setRecvMode] = useState(false);
  const [ordoNum, setOrdoNum] = useState('');

  const load = useCallback(async () => {
    const s = await ensureSettings();
    setSettings(s);
    const list = await fetchOrders();
    setOrders(list);
    setAlerts(await countAlerts());
  }, []);

  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    if (!f || filter === 'all') return orders;
    if (f.statuts) return orders.filter((o) => f.statuts.includes(o.statut));
    return orders.filter((o) => o.statut === f.id);
  }, [orders, filter]);

  const selectedIdx = filtered.findIndex((o) => o.id === selectedId);
  const selected = selectedIdx >= 0 ? filtered[selectedIdx] : null;

  useEffect(() => {
    if (selected) {
      setEditForm(orderToForm(selected, settings));
      setOrdoNum(selected.ordonnancier_number || '');
      setRecvMode(false);
      setAdminMode(false);
      setAdminDraft(null);
      setAdminOrdoFile(null);
      setAdminLibFile(null);
    } else {
      setEditForm(null);
      setAdminMode(false);
      setAdminDraft(null);
    }
  }, [selected?.id, settings]);

  const selectPrev = () => {
    if (selectedIdx > 0) setSelectedId(filtered[selectedIdx - 1].id);
  };
  const selectNext = () => {
    if (selectedIdx >= 0 && selectedIdx < filtered.length - 1) setSelectedId(filtered[selectedIdx + 1].id);
  };

  const enterAdminMode = () => {
    if (!selected || !canAdminEdit) return;
    setAdminDraft(orderToAdminDraft(selected, settings));
    setAdminOrdoFile(null);
    setAdminLibFile(null);
    setAdminMode(true);
    setRecvMode(false);
    setMsg('');
    setErr('');
  };

  const cancelAdminMode = () => {
    setAdminMode(false);
    setAdminDraft(null);
    setAdminOrdoFile(null);
    setAdminLibFile(null);
  };

  const handleAdminSave = async () => {
    if (!selected || !adminDraft) return;
    if (!window.confirm(
      `Enregistrer les modifications admin sur « ${selected.patient_initiales || selected.id.slice(0, 8)} » ?`,
    )) return;
    setAdminSaving(true);
    setErr('');
    setMsg('');
    try {
      await saveOrderAdmin(selected.id, adminDraft, {
        userId: user?.id,
        ordonnanceFile: adminOrdoFile,
        liberationFile: adminLibFile,
        recalcPrice: true,
      });
      setMsg('Dossier mis à jour (mode admin)');
      cancelAdminMode();
      await load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setAdminSaving(false);
    }
  };

  const handleDeleteOrder = async (order) => {
    if (!order?.id) return;
    const label = order.patient_initiales || order.id.slice(0, 8);
    if (!window.confirm(
      `Supprimer définitivement le dossier « ${label} » (${MAGISTRAL_STATUTS[order.statut] || order.statut}) ?\n\nCette action est irréversible.`,
    )) return;
    setErr('');
    setMsg('');
    try {
      await deleteOrder(order.id);
      setSelectedId(null);
      setRecvMode(false);
      cancelAdminMode();
      setMsg('Dossier supprimé');
      await load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="text-fuchsia-600" />
            Suivi — préparations magistrales
          </h1>
          <p className="text-sm text-slate-500">Donneur d’ordre → sous-traitant unique · BPP §7</p>
        </div>
        {alerts && (
          <div className="flex gap-2 text-xs">
            {[
              ['devis', 'Devis', alerts.devis],
              ['a_controler', 'À contrôler', alerts.a_controler],
              ['a_rappeler', 'À rappeler', alerts.a_rappeler],
              ['a_dispenser', 'À dispenser', alerts.a_dispenser],
            ].map(([fid, lab, n]) => (
              <button
                key={fid}
                type="button"
                onClick={() => setFilter(fid)}
                className={`px-2.5 py-1.5 rounded-lg border ${n > 0 ? 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-900 font-bold' : 'bg-white text-slate-500'}`}
              >
                {lab} <span className="ml-1">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}

      <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 space-y-2">
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`text-[11px] px-2 py-1 rounded-lg ${filter === f.id ? 'bg-fuchsia-600 text-white' : 'bg-white border'}`}
                >
                  {f.label}
                </button>
              ))}
              <button type="button" onClick={() => printListeDossiers(filtered)} className="text-[11px] px-2 py-1 rounded-lg border flex items-center gap-1 ml-auto">
                <Printer size={12} /> Liste
              </button>
            </div>
            <div className="bg-white rounded-xl border overflow-hidden max-h-[70vh] overflow-y-auto">
              {filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  className={`w-full text-left px-3 py-2.5 border-b text-sm hover:bg-fuchsia-50 ${selectedId === o.id ? 'bg-fuchsia-50' : ''}`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{o.patient_initiales || '—'}</span>
                    <span className="text-[10px] text-slate-500">{MAGISTRAL_STATUTS[o.statut]}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{o.formule}</p>
                  <p className="text-[10px] text-slate-400">{new Date(o.created_at).toLocaleDateString('fr-FR')}{o.patient_phone ? ` · ${o.patient_phone}` : ''}</p>
                </button>
              ))}
              {filtered.length === 0 && <p className="p-4 text-sm text-slate-500">Aucun dossier.</p>}
            </div>
          </div>

          <div className="lg:col-span-3">
            {!selected || !editForm ? (
              <div className="bg-white border rounded-xl p-8 text-center text-slate-400 text-sm">
                Sélectionnez un dossier
              </div>
            ) : (
              <div className="bg-white border rounded-xl p-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-lg">{selected.patient_initiales}</h3>
                    <p className="text-xs text-slate-500">
                      #{selected.id.slice(0, 8)} · {MAGISTRAL_STATUTS[selected.statut]}
                      {selected.patient_phone && <> · <span className="font-mono text-fuchsia-700 text-sm">{selected.patient_phone}</span></>}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" disabled={selectedIdx <= 0} onClick={selectPrev} className="p-2 border rounded-lg disabled:opacity-30"><ChevronLeft size={16} /></button>
                    <button type="button" disabled={selectedIdx < 0 || selectedIdx >= filtered.length - 1} onClick={selectNext} className="p-2 border rounded-lg disabled:opacity-30"><ChevronRight size={16} /></button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => printFeuilleSuivi(selected, settings)} className="text-xs px-2 py-1.5 border rounded-lg flex items-center gap-1"><Printer size={12} /> Feuille de suivi</button>
                  <button type="button" onClick={() => printFicheDemande(selected, settings)} className="text-xs px-2 py-1.5 border rounded-lg flex items-center gap-1"><Printer size={12} /> Fiche ST</button>
                  {canAdminEdit && !adminMode && (
                    <button
                      type="button"
                      onClick={enterAdminMode}
                      className="text-xs px-2 py-1.5 border border-amber-300 bg-amber-50 text-amber-900 rounded-lg flex items-center gap-1"
                    >
                      <Shield size={12} /> Mode admin
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteOrder(selected)}
                    className="text-xs px-2 py-1.5 border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 rounded-lg flex items-center gap-1 ml-auto"
                  >
                    <Trash2 size={12} /> Supprimer
                  </button>
                </div>

                {adminMode && adminDraft ? (
                  <div className="space-y-3 border border-amber-200 rounded-xl p-3 bg-amber-50/30">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1">
                        <Shield size={14} /> Édition admin — dossier complet
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={adminSaving}
                          onClick={cancelAdminMode}
                          className="text-xs px-3 py-1.5 border rounded-lg bg-white"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          disabled={adminSaving}
                          onClick={handleAdminSave}
                          className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold disabled:opacity-50"
                        >
                          {adminSaving ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                      </div>
                    </div>
                    <MagistralAdminEdit
                      draft={adminDraft}
                      settings={settings}
                      ordonnanceFile={adminOrdoFile}
                      liberationFile={adminLibFile}
                      onOrdonnanceFile={setAdminOrdoFile}
                      onLiberationFile={setAdminLibFile}
                      onChange={(p) => setAdminDraft((d) => ({ ...d, ...p }))}
                    />
                    <div className="flex gap-2 pt-1 border-t border-amber-200">
                      <button
                        type="button"
                        disabled={adminSaving}
                        onClick={cancelAdminMode}
                        className="flex-1 text-xs py-2 border rounded-lg bg-white"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        disabled={adminSaving}
                        onClick={handleAdminSave}
                        className="flex-1 text-xs py-2 rounded-lg bg-amber-600 text-white font-semibold disabled:opacity-50"
                      >
                        {adminSaving ? 'Enregistrement…' : 'Enregistrer les modifications'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {selected.statut === 'devis' && (
                      <div className="space-y-2 p-3 bg-slate-50 rounded-lg">
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={sendMailOnValidate} onChange={(e) => setSendMailOnValidate(e.target.checked)} />
                          E-mail prestataire à la validation
                        </label>
                        <button type="button" onClick={async () => {
                          try {
                            await validateDevis(selected.id, { launchOrder: true, sendEmail: sendMailOnValidate, userId: user.id });
                            setMsg('Devis → commande'); await load();
                          } catch (ex) { setErr(ex.message); }
                        }} className="w-full bg-emerald-600 text-white py-2 rounded-lg flex justify-center gap-1"><Send size={14} /> Valider & commander</button>
                        <button type="button" onClick={async () => {
                          try {
                            await validateDevis(selected.id, { launchOrder: false, userId: user.id });
                            setMsg('Devis refusé'); await load();
                          } catch (ex) { setErr(ex.message); }
                        }} className="w-full bg-slate-200 py-2 rounded-lg flex justify-center gap-1"><XCircle size={14} /> Refuser</button>
                      </div>
                    )}

                    {['commande', 'en_transit'].includes(selected.statut) && (
                      <div className="flex gap-2">
                        {selected.statut === 'commande' && (
                          <button type="button" onClick={async () => { await markInTransit(selected.id, user.id); load(); }} className="flex-1 bg-slate-100 py-2 rounded-lg text-xs font-semibold">En transit</button>
                        )}
                        <button type="button" onClick={async () => { await markArrived(selected.id, user.id); load(); }} className="flex-1 bg-amber-100 py-2 rounded-lg text-xs font-semibold flex justify-center gap-1"><Package size={14} /> Arrivé / à contrôler</button>
                      </div>
                    )}

                    {['a_controler', 'a_rappeler', 'commande', 'en_transit'].includes(selected.statut) && (
                      <div>
                        {!recvMode ? (
                          <button type="button" onClick={() => setRecvMode(true)} className="w-full bg-fuchsia-600 text-white py-2 rounded-lg font-semibold">
                            Réception / contrôle + appel patient
                          </button>
                        ) : (
                          <MagistralReceptionCall
                            order={selected}
                            settings={settings}
                            userId={user.id}
                            onCancel={() => setRecvMode(false)}
                            onDone={async (updated, opts) => {
                              if (opts?.stay) {
                                await load();
                                setSelectedId(updated.id);
                                return;
                              }
                              setRecvMode(false);
                              setMsg(`→ ${MAGISTRAL_STATUTS[updated.statut]}`);
                              await load();
                            }}
                          />
                        )}
                      </div>
                    )}

                    {selected.statut === 'receptionne' && (
                      <div className="space-y-2 p-3 bg-emerald-50 rounded-lg">
                        <Field label="N° ordonnancier DO *">
                          <input value={ordoNum} onChange={(e) => setOrdoNum(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="N°" />
                        </Field>
                        <button type="button" disabled={!ordoNum.trim()} onClick={async () => {
                          try {
                            let o = await dispenseOrder(selected.id, user.id, { ordonnancier_number: ordoNum });
                            o = await closeOrder(o.id, 'Dispensé', user.id);
                            printFeuilleSuivi(o, settings);
                            setMsg('Dispensé & clôturé'); await load();
                          } catch (ex) { setErr(ex.message); }
                        }} className="w-full bg-emerald-600 text-white py-2 rounded-lg font-semibold disabled:opacity-50">
                          Dispenser, imprimer & clôturer
                        </button>
                      </div>
                    )}

                    {selected.statut === 'non_conforme' && (
                      <button type="button" onClick={async () => { await reopenNonConforme(selected.id, user.id); load(); }} className="w-full bg-amber-100 py-2 rounded-lg text-sm font-semibold">
                        Relancer (retour devis)
                      </button>
                    )}

                    {selected.statut === 'dispense' && (
                      <button type="button" onClick={async () => { await closeOrder(selected.id, 'Archivage', user.id); load(); }} className="w-full bg-slate-600 text-white py-2 rounded-lg">
                        Clôturer / archiver
                      </button>
                    )}

                    {/* Édition formulaire standard (tous rôles Suivi) — champs demande/patient/analyse */}
                    <details className="border rounded-lg p-3">
                      <summary className="cursor-pointer font-semibold text-xs text-slate-700">Modifier le dossier (formulaire)</summary>
                      <div className="mt-3 space-y-3">
                        <MagistralOrderForm
                          form={editForm}
                          onChange={(p) => setEditForm((f) => ({ ...f, ...p }))}
                          step="full"
                          compact
                        />
                        <div className="flex gap-2">
                          <button type="button" onClick={async () => {
                            try {
                              await saveOrderFromForm(selected.id, editForm, { sendEmail: false, userId: user.id });
                              setMsg('Dossier enregistré'); await load();
                            } catch (ex) { setErr(ex.message); }
                          }} className="flex-1 bg-slate-100 py-2 rounded-lg text-xs font-semibold">Sauver</button>
                          <button type="button" onClick={async () => {
                            try {
                              await saveOrderFromForm(selected.id, editForm, { sendEmail: true, userId: user.id });
                              setMsg('Sauvé + mail ST'); await load();
                            } catch (ex) { setErr(ex.message); }
                          }} className="flex-1 bg-fuchsia-600 text-white py-2 rounded-lg text-xs font-semibold">Sauver + mail</button>
                        </div>
                        {canAdminEdit && (
                          <p className="text-[11px] text-slate-500">
                            Pour statut, réception, dispensation, fichiers : utilisez{' '}
                            <button type="button" className="underline text-amber-800" onClick={enterAdminMode}>Mode admin</button>.
                          </p>
                        )}
                      </div>
                    </details>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
