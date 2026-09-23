import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const inputCls = 'w-full p-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--fg)] focus:ring-2 focus:ring-[var(--ring)] focus:outline-none';

const TYPE_CHIPS = [
  { id: 'all', label: 'Tout' },
  { id: 'tasks', label: 'Tâches' },
  { id: 'calls', label: 'Appels' },
  { id: 'ips', label: 'IP' },
  { id: 'quality', label: 'Qualité' },
  { id: 'stock', label: 'Stock' },
];

const TASK_SUB = [
  { id: 'all', label: 'Toutes' },
  { id: 'dues', label: 'Dues' },
  { id: 'futures', label: 'Futures' },
  { id: 'multi', label: 'Multi' },
  { id: 'solo', label: 'Moi seul' },
];

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
        active
          ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-transparent'
          : 'bg-[var(--surface-elevated)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--fg)]'
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, icon: Icon, count, children }) {
  if (!count) return null;
  return (
    <section className="mb-3">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)] mb-2">
        <Icon size={14} /> {title}
        <span className="ml-auto bg-[var(--input-bg)] text-[var(--muted)] px-2 py-0.5 rounded-full text-[10px]">{count}</span>
      </h3>
      <ul className="space-y-1.5">{children}</ul>
    </section>
  );
}

function Row({ children, onOpen, onEdit }) {
  return (
    <li className="flex items-start gap-2 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] text-sm">
      <div className="flex-1 min-w-0">{children}</div>
      <div className="flex gap-1 shrink-0">
        {onEdit && (
          <button type="button" title="Corriger" onClick={onEdit} className="p-1.5 rounded-lg hover:bg-[var(--input-bg)] text-[var(--muted)]">
            <Pencil size={14} />
          </button>
        )}
        {onOpen && (
          <button type="button" title="Ouvrir" onClick={onOpen} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[var(--fg)] text-[var(--surface)] hover:opacity-90">
            Ouvrir
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Hub « À traiter » (comptoir) / Mes saisies (dashboard).
 * @param {{ mode?: 'hub'|'saisies', compact?: boolean }} props
 *  - hub : file + filtres, pas de mes saisies (comptoir + dashboard À traiter)
 *  - saisies : autocorrection uniquement
 */
export default function InboxPanel({ mode = 'hub', compact = false }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [taskSub, setTaskSub] = useState('all');

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

  const openTask = () => { openModuleWindow('tasks'); };
  const openDash = (page) => { openDashboardWindow({ page }); };

  const filteredTasks = useMemo(() => {
    const list = data?.tasks || [];
    return list.filter((t) => {
      if (taskSub === 'dues') return t.dueToday;
      if (taskSub === 'futures') return t.future;
      if (taskSub === 'multi') return t.multi;
      if (taskSub === 'solo') return t.solo;
      return true;
    });
  }, [data?.tasks, taskSub]);

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

  const showTasks = typeFilter === 'all' || typeFilter === 'tasks';
  const showCalls = typeFilter === 'all' || typeFilter === 'calls';
  const showIps = typeFilter === 'all' || typeFilter === 'ips';
  const showQuality = typeFilter === 'all' || typeFilter === 'quality';
  const showStock = typeFilter === 'all' || typeFilter === 'stock';

  const inboxCount = (showTasks ? filteredTasks.length : 0)
    + (showCalls ? (data?.calls?.length || 0) : 0)
    + (showIps ? (data?.ips?.length || 0) : 0)
    + (showQuality ? (data?.quality?.length || 0) : 0)
    + (showStock ? (data?.stock?.length || 0) : 0);

  const editCount = (data?.editable?.calls?.length || 0)
    + (data?.editable?.ips?.length || 0)
    + (data?.editable?.quality?.length || 0)
    + (data?.editable?.stock?.length || 0);

  const isSaisies = mode === 'saisies';

  return (
    <div className={`w-full h-full flex flex-col bg-[var(--surface)] text-[var(--fg)] ${compact ? '' : 'min-h-full'}`}>
      {!compact && (
        <header className="shrink-0 px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-elevated)]">
          <div className="flex items-center gap-2">
            <Inbox className="text-[var(--accent)] shrink-0" size={22} />
            <div className="min-w-0">
              <h2 className="font-bold text-xl text-[var(--fg)]">
                {isSaisies ? 'Mes saisies' : 'À traiter'}
              </h2>
              <p className="text-sm text-[var(--muted)]">
                {isSaisies ? 'Autocorrection des saisies non clôturées' : 'File perso — tâches et dossiers ouverts'}
              </p>
            </div>
          </div>
        </header>
      )}

      {!isSaisies && (
        <div className={`shrink-0 border-b border-[var(--border)] bg-[var(--surface-elevated)] space-y-2 ${compact ? 'px-3 py-2' : 'px-6 py-3'}`}>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_CHIPS.map((c) => (
              <Chip key={c.id} active={typeFilter === c.id} onClick={() => setTypeFilter(c.id)}>
                {c.label}
              </Chip>
            ))}
          </div>
          {(typeFilter === 'all' || typeFilter === 'tasks') && (
            <div className="flex flex-wrap gap-1.5">
              {TASK_SUB.map((c) => (
                <Chip key={c.id} active={taskSub === c.id} onClick={() => setTaskSub(c.id)}>
                  {c.label}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={`flex-1 overflow-y-auto space-y-1 ${compact ? 'p-3' : 'p-6'}`}>
        {loading && <p className="text-sm text-[var(--muted)]">Chargement…</p>}
        {err && (
          <div className="mb-3 p-3 bg-red-50 text-[var(--danger)] rounded-lg border border-red-200 text-sm">{err}</div>
        )}
        {msg && (
          <div className="mb-3 p-3 bg-emerald-50 text-[var(--success)] rounded-lg border border-emerald-200 text-sm">{msg}</div>
        )}

        {!isSaisies && data && !loading && (
          <>
            {!inboxCount && (
              <p className="text-center text-[var(--muted)] mt-10">Rien à traiter pour le moment.</p>
            )}
            {showTasks && (
              <Section title="Tâches" icon={CheckSquare} count={filteredTasks.length}>
                {filteredTasks.map((t) => (
                  <Row key={t.id} onOpen={openTask}>
                    <p className="font-medium truncate">{t.titre}</p>
                    <p className="text-[11px] text-[var(--muted)]">
                      {t.date || 'sans date'}
                      {t.type ? ` · ${t.type}` : ''}
                      {t.multi ? ` · ${t.assigneeCount} assignés` : ''}
                      {t.future ? ' · future' : ''}
                    </p>
                  </Row>
                ))}
              </Section>
            )}
            {showCalls && (
              <Section title="Appels" icon={Phone} count={data.calls.length}>
                {data.calls.map((c) => (
                  <Row key={c.id} onOpen={() => openModuleWindow('call')}>
                    <p className="font-medium truncate">{c.contact_nom || c.numero || 'Appel'}</p>
                    <p className="text-[11px] text-[var(--muted)]">{c.statut_traitement} · {c.motif}</p>
                  </Row>
                ))}
              </Section>
            )}
            {showIps && (
              <Section title="Act-IP" icon={Activity} count={data.ips.length}>
                {data.ips.map((i) => (
                  <Row key={i.id} onOpen={() => openModuleWindow('ip')}>
                    <p className="font-medium truncate">{i.patient_initiales || i.medicament || 'IP'}</p>
                    <p className="text-[11px] text-[var(--muted)]">{i.statut_ip}</p>
                  </Row>
                ))}
              </Section>
            )}
            {showQuality && (
              <Section title="Qualité" icon={ShieldAlert} count={data.quality.length}>
                {data.quality.map((q) => (
                  <Row key={q.id} onOpen={() => openDash('quality')}>
                    <p className="font-medium truncate">{q.type || 'NC'}</p>
                    <p className="text-[11px] text-[var(--muted)]">{q.status}</p>
                  </Row>
                ))}
              </Section>
            )}
            {showStock && (
              <Section title="Stock" icon={PackageX} count={data.stock.length}>
                {data.stock.map((s) => (
                  <Row key={s.id} onOpen={() => openDash('stock')}>
                    <p className="font-medium truncate">{s.medicament || 'Erreur stock'}</p>
                    <p className="text-[11px] text-[var(--muted)]">{s.status}</p>
                  </Row>
                ))}
              </Section>
            )}
          </>
        )}

        {isSaisies && data && !loading && (
          <>
            {edit ? (
              <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-4 space-y-3 mb-4">
                <h3 className="text-sm font-semibold text-[var(--fg)]">Correction — {edit.kind}</h3>
                {Object.entries(edit.fields).map(([key, value]) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-[var(--muted)] mb-1">{key}</label>
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
                    className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:opacity-90 text-[var(--accent-fg)] text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? '…' : 'Enregistrer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEdit(null)}
                    className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--fg)] hover:bg-[var(--input-bg)]"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : null}

            {!editCount && !edit && (
              <p className="text-center text-[var(--muted)] mt-10">Aucune saisie corrigeable.</p>
            )}

            <Section title="Mes appels" icon={Phone} count={data.editable.calls.length}>
              {data.editable.calls.map((c) => (
                <Row key={c.id} onEdit={() => startEdit('call', c)}>
                  <p className="font-medium truncate">{c.contact_nom || c.numero || 'Appel'}</p>
                  <p className="text-[11px] text-[var(--muted)]">{c.statut_traitement}</p>
                </Row>
              ))}
            </Section>
            <Section title="Mes Act-IP" icon={Activity} count={data.editable.ips.length}>
              {data.editable.ips.map((i) => (
                <Row key={i.id} onEdit={() => startEdit('ip', i)}>
                  <p className="font-medium truncate">{i.patient_initiales || i.medicament || 'IP'}</p>
                  <p className="text-[11px] text-[var(--muted)]">{i.statut_ip}</p>
                </Row>
              ))}
            </Section>
            <Section title="Mes NC qualité" icon={ShieldAlert} count={data.editable.quality.length}>
              {data.editable.quality.map((q) => (
                <Row key={q.id} onEdit={() => startEdit('quality', q)}>
                  <p className="font-medium truncate">{q.type || 'NC'}</p>
                  <p className="text-[11px] text-[var(--muted)]">{q.status}</p>
                </Row>
              ))}
            </Section>
            <Section title="Mes erreurs stock" icon={PackageX} count={data.editable.stock.length}>
              {data.editable.stock.map((s) => (
                <Row key={s.id} onEdit={() => startEdit('stock', s)}>
                  <p className="font-medium truncate">{s.medicament || 'Stock'}</p>
                  <p className="text-[11px] text-[var(--muted)]">{s.status}</p>
                </Row>
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
