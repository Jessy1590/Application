import React, { useCallback, useEffect, useState } from 'react';
import { Inbox, Pencil, CheckSquare, Phone, Activity, ShieldAlert, PackageX } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { openModuleWindow, openDashboardWindow } from '../../../shared/windowService.js';
import {
  fetchInboxItems,
  updateMyCall,
  updateMyIp,
  updateMyQuality,
  updateMyStock,
} from '../services/inboxService.js';

const inputCls = 'w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:outline-none';

function Section({ title, icon: Icon, count, children }) {
  if (!count) return null;
  return (
    <section className="mb-4">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
        <Icon size={14} /> {title}
        <span className="ml-auto bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">{count}</span>
      </h3>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

function Row({ children, onOpen, onEdit }) {
  return (
    <li className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 bg-white shadow-sm text-sm">
      <div className="flex-1 min-w-0">{children}</div>
      <div className="flex gap-1 shrink-0">
        {onEdit && (
          <button type="button" title="Corriger" onClick={onEdit} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
            <Pencil size={14} />
          </button>
        )}
        {onOpen && (
          <button type="button" title="Ouvrir" onClick={onOpen} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 text-white hover:bg-slate-700">
            Ouvrir
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Centre « À traiter » + autocorrection de mes saisies (complément LGO).
 * @param {{ initialTab?: 'inbox'|'mes_saisies', compact?: boolean }} props
 */
export default function InboxPanel({ initialTab = 'inbox', compact = false }) {
  const { user } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const next = await fetchInboxItems(user.id);
      setData(next);
      setErr('');
    } catch (e) {
      setErr(e.message || 'Erreur chargement');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const openTask = () => {
    openModuleWindow('tasks');
  };
  const openDash = (page) => {
    openDashboardWindow({ page });
  };

  const startEdit = (kind, row) => {
    setMsg('');
    if (kind === 'call') {
      setEdit({
        kind,
        id: row.id,
        fields: {
          contact_nom: row.contact_nom || '',
          numero: row.numero || '',
          motif: row.motif || 'autre',
          statut_traitement: row.statut_traitement || 'resolu',
          notes_appel: row.notes_appel || '',
        },
      });
    } else if (kind === 'ip') {
      setEdit({
        kind,
        id: row.id,
        fields: {
          patient_initiales: row.patient_initiales || '',
          medicament: row.medicament || '',
          probleme: row.probleme || '',
          statut_ip: row.statut_ip || 'En attente',
        },
      });
    } else if (kind === 'quality') {
      setEdit({
        kind,
        id: row.id,
        fields: {
          type: row.type || '',
          severity: row.severity || '',
          description: row.data?.description || '',
          status: row.status || 'ouvert',
        },
      });
    } else if (kind === 'stock') {
      setEdit({
        kind,
        id: row.id,
        fields: {
          medicament: row.medicament || '',
          cip: row.cip || '',
          description: row.description || '',
          quantite_theorique: row.quantite_theorique ?? '',
          quantite_constatee: row.quantite_constatee ?? '',
        },
      });
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    setSaving(true);
    setMsg('');
    try {
      if (edit.kind === 'call') {
        await updateMyCall(edit.id, edit.fields);
      } else if (edit.kind === 'ip') {
        await updateMyIp(edit.id, edit.fields);
      } else if (edit.kind === 'quality') {
        const { description, type, severity, status } = edit.fields;
        await updateMyQuality(edit.id, {
          type,
          severity,
          status,
          data: { ...(data?.editable?.quality?.find((q) => q.id === edit.id)?.data || {}), description },
        });
      } else if (edit.kind === 'stock') {
        const f = edit.fields;
        await updateMyStock(edit.id, {
          medicament: f.medicament,
          cip: f.cip,
          description: f.description,
          quantite_theorique: f.quantite_theorique === '' ? null : Number(f.quantite_theorique),
          quantite_constatee: f.quantite_constatee === '' ? null : Number(f.quantite_constatee),
        });
      }
      setEdit(null);
      setMsg('Enregistré');
      await load();
    } catch (e) {
      setMsg(e.message || 'Échec enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const inboxCount = (data?.tasks?.length || 0)
    + (data?.calls?.length || 0)
    + (data?.ips?.length || 0)
    + (data?.quality?.length || 0)
    + (data?.stock?.length || 0);

  const editCount = (data?.editable?.calls?.length || 0)
    + (data?.editable?.ips?.length || 0)
    + (data?.editable?.quality?.length || 0)
    + (data?.editable?.stock?.length || 0);

  return (
    <div className={`w-full h-full flex flex-col bg-slate-50 text-slate-800 ${compact ? '' : 'min-h-full'}`}>
      {!compact && (
        <header className="shrink-0 px-6 py-4 border-b border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2">
            <Inbox className="text-indigo-600 shrink-0" size={22} />
            <div className="min-w-0">
              <h2 className="font-bold text-xl text-slate-800">À traiter & mes saisies</h2>
              <p className="text-sm text-slate-500">Complément LGO — file perso + corrections</p>
            </div>
          </div>
        </header>
      )}

      <div className={`flex gap-1 border-b border-slate-200 bg-white ${compact ? 'px-4' : 'px-6'}`}>
        <button
          type="button"
          onClick={() => setTab('inbox')}
          className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'inbox'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          À traiter ({inboxCount})
        </button>
        <button
          type="button"
          onClick={() => setTab('mes_saisies')}
          className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'mes_saisies'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          Mes saisies ({editCount})
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto space-y-1 ${compact ? 'p-4' : 'p-6'}`}>
        {loading && <p className="text-sm text-slate-500">Chargement…</p>}
        {err && (
          <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">{err}</div>
        )}
        {msg && (
          <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200 text-sm">{msg}</div>
        )}

        {tab === 'inbox' && data && !loading && (
          <>
            {!inboxCount && (
              <p className="text-center text-slate-500 mt-10">Rien à traiter pour le moment.</p>
            )}
            <Section title="Tâches du jour" icon={CheckSquare} count={data.tasks.length}>
              {data.tasks.map((t) => (
                <Row key={t.id} onOpen={openTask}>
                  <p className="font-medium truncate">{t.titre}</p>
                  <p className="text-[11px] text-slate-500">{t.date || 'sans date'}{t.type ? ` · ${t.type}` : ''}</p>
                </Row>
              ))}
            </Section>
            <Section title="Appels" icon={Phone} count={data.calls.length}>
              {data.calls.map((c) => (
                <Row
                  key={c.id}
                  onOpen={() => openModuleWindow('call')}
                  onEdit={() => { setTab('mes_saisies'); startEdit('call', c); }}
                >
                  <p className="font-medium truncate">{c.contact_nom || c.numero || 'Appel'}</p>
                  <p className="text-[11px] text-slate-500">{c.statut_traitement} · {c.motif}</p>
                </Row>
              ))}
            </Section>
            <Section title="Act-IP" icon={Activity} count={data.ips.length}>
              {data.ips.map((i) => (
                <Row
                  key={i.id}
                  onOpen={() => openModuleWindow('ip')}
                  onEdit={() => { setTab('mes_saisies'); startEdit('ip', i); }}
                >
                  <p className="font-medium truncate">{i.patient_initiales || i.medicament || 'IP'}</p>
                  <p className="text-[11px] text-slate-500">{i.statut_ip}</p>
                </Row>
              ))}
            </Section>
            <Section title="Qualité" icon={ShieldAlert} count={data.quality.length}>
              {data.quality.map((q) => (
                <Row
                  key={q.id}
                  onOpen={() => openDash('quality')}
                  onEdit={() => { setTab('mes_saisies'); startEdit('quality', q); }}
                >
                  <p className="font-medium truncate">{q.type || 'NC'}</p>
                  <p className="text-[11px] text-slate-500">{q.status}</p>
                </Row>
              ))}
            </Section>
            <Section title="Stock" icon={PackageX} count={data.stock.length}>
              {data.stock.map((s) => (
                <Row
                  key={s.id}
                  onOpen={() => openDash('stock')}
                  onEdit={() => { setTab('mes_saisies'); startEdit('stock', s); }}
                >
                  <p className="font-medium truncate">{s.medicament || 'Erreur stock'}</p>
                  <p className="text-[11px] text-slate-500">{s.status}</p>
                </Row>
              ))}
            </Section>
          </>
        )}

        {tab === 'mes_saisies' && data && !loading && (
          <>
            {edit ? (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3 mb-4">
                <h3 className="text-sm font-semibold text-slate-800">Correction — {edit.kind}</h3>
                {Object.entries(edit.fields).map(([key, value]) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">{key}</label>
                    <input
                      className={inputCls}
                      value={value ?? ''}
                      onChange={(e) => setEdit((prev) => ({
                        ...prev,
                        fields: { ...prev.fields, [key]: e.target.value },
                      }))}
                    />
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveEdit}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? '…' : 'Enregistrer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEdit(null)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : null}

            {!editCount && !edit && (
              <p className="text-center text-slate-500 mt-10">Aucune saisie corrigeable.</p>
            )}

            <Section title="Mes appels" icon={Phone} count={data.editable.calls.length}>
              {data.editable.calls.map((c) => (
                <Row key={c.id} onEdit={() => startEdit('call', c)}>
                  <p className="font-medium truncate">{c.contact_nom || c.numero || 'Appel'}</p>
                  <p className="text-[11px] text-slate-500">{c.statut_traitement}</p>
                </Row>
              ))}
            </Section>
            <Section title="Mes Act-IP" icon={Activity} count={data.editable.ips.length}>
              {data.editable.ips.map((i) => (
                <Row key={i.id} onEdit={() => startEdit('ip', i)}>
                  <p className="font-medium truncate">{i.patient_initiales || i.medicament || 'IP'}</p>
                  <p className="text-[11px] text-slate-500">{i.statut_ip}</p>
                </Row>
              ))}
            </Section>
            <Section title="Mes NC qualité" icon={ShieldAlert} count={data.editable.quality.length}>
              {data.editable.quality.map((q) => (
                <Row key={q.id} onEdit={() => startEdit('quality', q)}>
                  <p className="font-medium truncate">{q.type || 'NC'}</p>
                  <p className="text-[11px] text-slate-500">{q.status}</p>
                </Row>
              ))}
            </Section>
            <Section title="Mes erreurs stock" icon={PackageX} count={data.editable.stock.length}>
              {data.editable.stock.map((s) => (
                <Row key={s.id} onEdit={() => startEdit('stock', s)}>
                  <p className="font-medium truncate">{s.medicament || 'Stock'}</p>
                  <p className="text-[11px] text-slate-500">{s.status}</p>
                </Row>
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
