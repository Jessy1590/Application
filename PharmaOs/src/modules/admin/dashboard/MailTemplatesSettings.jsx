import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Info, Mail } from 'lucide-react';
import {
  MAIL_MODULES,
  MAIL_PLACEHOLDERS_BY_MODULE,
  MAIL_TEMPLATE_DEFS,
  DEFAULT_MAIL_TEMPLATES,
} from '../services/mailTemplatesCatalog.js';
import { getMailTemplatesForEdit, saveMailTemplates } from '../services/mailTemplatesService.js';

const inputCls = 'w-full p-2 border rounded-lg bg-white';
const BANNER_LS_KEY = 'pharmaos.mail_placeholders_banner_collapsed';

function PlaceholdersBanner({ placeholders, onInsert }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(BANNER_LS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(BANNER_LS_KEY, next ? '1' : '0');
      } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 text-sm text-sky-950 overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-sky-100/60 transition-colors"
        aria-expanded={!collapsed}
      >
        <span className="font-semibold flex items-center gap-1.5 text-sky-900">
          <Info size={16} /> Masques disponibles ({placeholders.length})
        </span>
        <span className="text-[11px] text-sky-700 flex items-center gap-1 shrink-0">
          {collapsed ? 'Afficher' : 'Masquer'}
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-3 text-xs leading-relaxed space-y-2 border-t border-sky-100">
          <p className="pt-2 text-sky-900/90">
            Cliquez un masque pour l’insérer au curseur dans l’objet ou le corps.
            Format : <code className="bg-white/80 px-1 rounded">{'{nom}'}</code>
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto pr-1">
            {placeholders.map((p) => (
              <button
                key={p.key}
                type="button"
                title={p.label}
                onClick={() => onInsert(`{${p.key}}`)}
                className="inline-flex items-baseline gap-1.5 px-2 py-1 rounded-md bg-white border border-sky-200 text-sky-900 hover:bg-sky-100 text-left"
              >
                <span className="font-mono text-[11px]">{`{${p.key}}`}</span>
                <span className="text-[10px] text-sky-700/90 font-normal">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

/** Paramètres → Templates mail (tous modules). */
export default function MailTemplatesSettings() {
  const [tree, setTree] = useState(null);
  const [moduleId, setModuleId] = useState(MAIL_MODULES[0]?.id || 'magistral');
  const [mailKey, setMailKey] = useState(MAIL_TEMPLATE_DEFS.magistral?.[0]?.id || 'devis');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const focusedMail = useRef('body');

  const load = useCallback(async () => {
    const data = await getMailTemplatesForEdit();
    setTree(data);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  useEffect(() => {
    const defs = MAIL_TEMPLATE_DEFS[moduleId] || [];
    if (!defs.some((d) => d.id === mailKey)) {
      setMailKey(defs[0]?.id || '');
    }
  }, [moduleId, mailKey]);

  const patchMail = (mod, key, field, value) => {
    setTree((prev) => ({
      ...prev,
      [mod]: {
        ...(prev?.[mod] || {}),
        [key]: {
          ...(prev?.[mod]?.[key] || DEFAULT_MAIL_TEMPLATES[mod]?.[key] || {}),
          [field]: value,
        },
      },
    }));
  };

  const insertPlaceholder = (token) => {
    const ref = focusedMail.current === 'subject' ? subjectRef : bodyRef;
    const el = ref.current;
    const field = focusedMail.current === 'subject' ? 'subject' : 'body';
    if (!el) {
      patchMail(moduleId, mailKey, field, `${tree?.[moduleId]?.[mailKey]?.[field] || ''}${token}`);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    patchMail(moduleId, mailKey, field, next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const resetMailDefaults = () => {
    const def = DEFAULT_MAIL_TEMPLATES[moduleId]?.[mailKey];
    if (!def) return;
    patchMail(moduleId, mailKey, 'subject', def.subject);
    patchMail(moduleId, mailKey, 'body', def.body);
  };

  const save = async () => {
    setErr('');
    setMsg('');
    setSaving(true);
    try {
      await saveMailTemplates(tree || {});
      setMsg('Templates enregistrés');
      await load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  if (!tree && !err) {
    return <p className="text-sm text-slate-500">Chargement des templates…</p>;
  }

  const moduleMails = MAIL_TEMPLATE_DEFS[moduleId] || [];
  const placeholders = MAIL_PLACEHOLDERS_BY_MODULE[moduleId] || [];
  const current = tree?.[moduleId]?.[mailKey] || DEFAULT_MAIL_TEMPLATES[moduleId]?.[mailKey] || { subject: '', body: '' };
  const meta = moduleMails.find((m) => m.id === mailKey);

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-sm text-slate-500 flex items-center gap-2">
        <Mail size={16} className="text-slate-400" />
        E-mails transactionnels de toute l’application — objet, corps HTML et masques {'{…}'}.
      </p>
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}

      <div className="flex flex-wrap gap-1.5">
        {MAIL_MODULES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setModuleId(m.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              moduleId === m.id
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-700 hover:border-slate-400'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="bg-white p-5 rounded-xl border space-y-4 text-sm">
        <PlaceholdersBanner placeholders={placeholders} onInsert={insertPlaceholder} />

        <div className="flex flex-wrap gap-1.5">
          {moduleMails.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMailKey(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                mailKey === m.id
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {meta && (
          <p className="text-[11px] text-slate-500">
            Destinataire type : <strong>{meta.dest}</strong>
          </p>
        )}

        <Field label="Objet">
          <input
            ref={subjectRef}
            value={current.subject || ''}
            onFocus={() => { focusedMail.current = 'subject'; }}
            onChange={(e) => patchMail(moduleId, mailKey, 'subject', e.target.value)}
            className={inputCls}
            placeholder="Objet du mail…"
          />
        </Field>
        <Field label="Corps (HTML autorisé)" hint="Utilisez les masques du bandeau ci-dessus">
          <textarea
            ref={bodyRef}
            rows={14}
            value={current.body || ''}
            onFocus={() => { focusedMail.current = 'body'; }}
            onChange={(e) => patchMail(moduleId, mailKey, 'body', e.target.value)}
            className={`${inputCls} font-mono text-xs`}
            placeholder="<p>Bonjour…</p>"
          />
        </Field>
        <div className="flex gap-2">
          <button type="button" onClick={resetMailDefaults} className="flex-1 border py-2 rounded-lg text-xs font-semibold">
            Réinitialiser ce template
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-1 bg-slate-800 text-white py-2 rounded-lg font-semibold disabled:opacity-60"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer les templates'}
          </button>
        </div>
      </div>
    </div>
  );
}
