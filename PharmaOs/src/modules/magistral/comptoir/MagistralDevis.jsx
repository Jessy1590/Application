import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Phone, Send, XCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { closeModuleWindow } from '../../../shared/windowService.js';
import {
  MAGISTRAL_STATUTS,
  fetchOrders,
  recordProviderQuote,
  hasProviderQuote,
  validateDevis,
  calcMagistralPrice,
  ensureSettings,
} from '../services/magistralService.js';

/**
 * Comptoir — flux devis ST :
 * 1) Demande déjà envoyée au prestataire (création nature=devis)
 * 2) À réception du mail ST → saisir le devis
 * 3) Appeler le patient → accepte = commande | refuse = clôture
 */
export default function MagistralDevis() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState(null);
  const [prixHt, setPrixHt] = useState('');
  const [tva, setTva] = useState('5.5');
  const [note, setNote] = useState('');
  const [sendMail, setSendMail] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([
        fetchOrders({ statut: ['devis'] }),
        ensureSettings(),
      ]);
      setOrders(list);
      setSettings(s);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openOrder = (o) => {
    setSelected(o);
    setMsg('');
    setErr('');
    const st = o.form_data?.devis_st;
    setPrixHt(st?.ht != null ? String(st.ht) : (o.prix_ht_net != null ? String(o.prix_ht_net) : ''));
    setTva(st?.tva != null ? String(st.tva) : (o.tva_rate != null ? String(o.tva_rate) : '5.5'));
    setNote(st?.note || '');
  };

  const previewTtc = prixHt !== '' && settings
    ? calcMagistralPrice(settings, Number(prixHt), Number(tva))
    : null;

  const saveQuote = async () => {
    if (!selected) return;
    setLoading(true); setErr(''); setMsg('');
    try {
      const updated = await recordProviderQuote(selected.id, user.id, {
        prixHt: Number(prixHt),
        tvaRate: Number(tva),
        note: note.trim() || null,
      });
      setSelected(updated);
      setMsg('Devis prestataire enregistré — appelez le patient.');
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const decide = async (accept) => {
    if (!selected) return;
    if (accept && !hasProviderQuote(selected)) {
      setErr('Enregistrez d’abord le devis du prestataire.');
      return;
    }
    setLoading(true); setErr(''); setMsg('');
    try {
      await validateDevis(selected.id, {
        launchOrder: accept,
        sendEmail: accept ? sendMail : false,
        userId: user.id,
      });
      setMsg(accept
        ? 'Patient a accepté → commande lancée auprès du prestataire.'
        : 'Patient a refusé → demande clôturée.');
      setSelected(null);
      await load();
      setTimeout(() => closeModuleWindow(), 900);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const phone = selected?.patient_phone || selected?.form_data?.patient?.phone || '';
  const quoteReady = selected ? hasProviderQuote(selected) : false;
  const devisSt = selected?.form_data?.devis_st;

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="px-4 py-3 bg-white border-b shrink-0">
        <h1 className="text-sm font-bold text-fuchsia-900">Devis — prestataire puis patient</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          1) Devis ST reçu → 2) Appel patient → accepte = commande / refuse = clôture
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex gap-2"><CheckCircle2 size={16} /> {msg}</div>}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

        <div className="max-w-xl mx-auto space-y-3">
          {!selected ? (
            <>
              {orders.length === 0 && <p className="text-sm text-slate-500">Aucun devis en attente.</p>}
              {orders.map((o) => {
                const ready = hasProviderQuote(o);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => openOrder(o)}
                    className="w-full text-left bg-white border rounded-xl p-3 hover:border-fuchsia-300"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-sm">{o.patient_initiales || '—'}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${ready ? 'bg-amber-100 text-amber-900' : 'bg-slate-100'}`}>
                        {ready ? 'À appeler (devis ST)' : 'Attente devis ST'}
                      </span>
                    </div>
                    {o.patient_phone && <p className="text-xs font-mono text-fuchsia-700 mt-1">{o.patient_phone}</p>}
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{o.formule}</p>
                    {o.prix_calcule != null && (
                      <p className="text-xs text-slate-600 mt-1">Devis : <strong>{o.prix_calcule} € TTC</strong></p>
                    )}
                  </button>
                );
              })}
            </>
          ) : (
            <div className="bg-white border rounded-xl p-4 space-y-4 text-sm">
              <button type="button" onClick={() => setSelected(null)} className="text-xs text-slate-500 flex items-center gap-1">
                <ArrowLeft size={12} /> Liste
              </button>
              <div>
                <h3 className="font-bold">{selected.patient_initiales}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-3">{selected.formule}</p>
                <p className="text-[10px] text-slate-400 mt-1">{MAGISTRAL_STATUTS[selected.statut]}</p>
              </div>

              {/* Étape 1 — devis prestataire */}
              <div className="border rounded-lg p-3 space-y-2 bg-slate-50">
                <h4 className="font-semibold text-fuchsia-900 text-xs uppercase tracking-wide">
                  1. Devis reçu du prestataire
                </h4>
                {quoteReady && devisSt && (
                  <p className="text-xs text-emerald-700">
                    Enregistré : {devisSt.ht} € HT → <strong>{devisSt.ttc} € TTC</strong>
                    {devisSt.received_at && ` (${new Date(devisSt.received_at).toLocaleString('fr-FR')})`}
                  </p>
                )}
                <label className="block text-xs font-semibold">Prix HT net ST (€) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={prixHt}
                  onChange={(e) => setPrixHt(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                  placeholder="Montant du devis e-mail"
                />
                <label className="block text-xs font-semibold">TVA (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={tva}
                  onChange={(e) => setTva(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                />
                {previewTtc != null && (
                  <p className="text-xs text-fuchsia-700">TTC estimé (port + coef) : <strong>{previewTtc} €</strong></p>
                )}
                <label className="block text-xs font-semibold">Note</label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                  placeholder="Réf. devis ST, délais…"
                />
                <button
                  type="button"
                  disabled={loading || prixHt === ''}
                  onClick={saveQuote}
                  className="w-full bg-slate-800 text-white py-2 rounded-lg font-semibold disabled:opacity-50"
                >
                  {quoteReady ? 'Mettre à jour le devis ST' : 'Enregistrer le devis ST'}
                </button>
              </div>

              {/* Étape 2 — appel patient */}
              <div className={`border rounded-lg p-3 space-y-3 ${quoteReady ? 'bg-fuchsia-50 border-fuchsia-200' : 'opacity-50 pointer-events-none'}`}>
                <h4 className="font-semibold text-fuchsia-900 text-xs uppercase tracking-wide flex items-center gap-1">
                  <Phone size={14} /> 2. Appel patient — présenter le devis
                </h4>
                {!quoteReady && (
                  <p className="text-xs text-slate-500">Enregistrez d’abord le devis du prestataire.</p>
                )}
                <div className="text-center py-2">
                  <p className="text-xs text-fuchsia-700 font-semibold">N° patient</p>
                  <p className="text-2xl font-bold text-fuchsia-900 font-mono tracking-wide">{phone || '—'}</p>
                  {phone && (
                    <a href={`tel:${phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 mt-1 text-fuchsia-700 text-xs font-semibold hover:underline">
                      <Phone size={14} /> Appeler
                    </a>
                  )}
                  {(devisSt?.ttc ?? selected.prix_calcule) != null && (
                    <p className="text-sm mt-2">
                      Montant à annoncer :{' '}
                      <strong>{devisSt?.ttc ?? selected.prix_calcule} € TTC</strong>
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} />
                  E-mail commande au prestataire si acceptation
                </label>
                <button
                  type="button"
                  disabled={loading || !quoteReady}
                  onClick={() => decide(true)}
                  className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-semibold flex justify-center items-center gap-1 disabled:opacity-50"
                >
                  <Send size={14} /> Patient accepte → lancer la commande
                </button>
                <button
                  type="button"
                  disabled={loading || !quoteReady}
                  onClick={() => decide(false)}
                  className="w-full bg-slate-200 py-2.5 rounded-lg font-semibold flex justify-center items-center gap-1 disabled:opacity-50"
                >
                  <XCircle size={14} /> Patient refuse → clôturer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
