'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { resolveSiteHref } from '@/config/sites';
import {
  PASSWORD_HINT,
  PortailProfile,
  changePassword,
  confirmEmailChangeOtp,
  getSupabasePublicEnv,
  mustChangePassword,
  requestEmailChange,
  updateDisplayName,
  validatePassword,
} from '@/lib/portail-auth';

type Site = {
  id: string;
  name: string;
  description?: string | null;
  url: string;
  icon?: string | null;
  color?: string | null;
  is_active?: boolean | null;
  visible_with_access_only?: boolean | null;
};

type Tab = 'mine' | 'account' | 'admin';

export default function HubDashboard() {
  const router = useRouter();
  const sb = createClient();
  const { url: supabaseUrl, anonKey } = getSupabasePublicEnv();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PortailProfile | null>(null);
  const [tab, setTab] = useState<Tab>('mine');
  const [forcePwd, setForcePwd] = useState(false);
  const [loading, setLoading] = useState(true);

  const [sites, setSites] = useState<Site[]>([]);
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set());
  const [pendingMap, setPendingMap] = useState<Map<string, string>>(new Map());
  const [mineError, setMineError] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  const loadMine = useCallback(async (uid: string, admin: boolean) => {
    setMineError(null);
    const [{ data: siteRows, error }, { data: myAccess }, { data: myRequests }] =
      await Promise.all([
        sb
          .from('sites')
          .select('id, name, description, url, icon, color, visible_with_access_only')
          .order('name'),
        sb.from('site_access').select('site_id').eq('user_id', uid),
        sb
          .from('access_requests')
          .select('id, site_id, status')
          .eq('user_id', uid)
          .eq('status', 'pending'),
      ]);
    if (error) {
      setMineError('Impossible de charger les sites.');
      return;
    }
    const granted = new Set((myAccess || []).map((a) => a.site_id as string));
    const pending = new Map(
      (myRequests || []).map((r) => [r.site_id as string, r.id as string]),
    );
    setSites((siteRows || []) as Site[]);
    setGrantedIds(granted);
    setPendingMap(pending);
    void admin;
  }, [sb]);

  const boot = useCallback(async () => {
    setLoading(true);
    const {
      data: { user: u },
    } = await sb.auth.getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setUser(u);

    let { data, error } = await sb
      .from('profiles')
      .select('display_name, role, email, must_change_password')
      .eq('id', u.id)
      .single();
    if (error && /must_change_password/i.test(error.message || '')) {
      ({ data, error } = await sb
        .from('profiles')
        .select('display_name, role, email')
        .eq('id', u.id)
        .single());
      if (!error && data) data = { ...data, must_change_password: false };
    }
    const p = (error ? null : data) as PortailProfile | null;
    setProfile(p);

    if (mustChangePassword(u, p)) {
      setForcePwd(true);
      setLoading(false);
      return;
    }
    setForcePwd(false);
    const admin = p?.role === 'admin';
    await loadMine(u.id, !!admin);
    setLoading(false);
  }, [sb, router, loadMine]);

  useEffect(() => {
    void boot();
  }, [boot]);

  async function signOut() {
    await sb.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  async function requestAccess(siteId: string) {
    if (!user) return;
    const { error } = await sb
      .from('access_requests')
      .insert({ user_id: user.id, site_id: siteId });
    if (!error) await loadMine(user.id, isAdmin);
  }

  const visibleSites = sites.filter((s) => {
    if (isAdmin) return true;
    if (s.visible_with_access_only && !grantedIds.has(s.id)) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="screen">
        <p className="dash-sub">Chargement…</p>
      </div>
    );
  }

  return (
    <>
      {forcePwd && user ? (
        <ForcePasswordGate
          onDone={async () => {
            setForcePwd(false);
            await boot();
          }}
        />
      ) : null}

      <div className="screen" style={{ alignItems: 'flex-start' }}>
        <div className="dash">
          <div className="dash-header">
            <div>
              <h1>
                Bonjour, {profile?.display_name || profile?.email || 'toi'}
              </h1>
              <p className="dash-sub">
                {isAdmin ? 'ADMIN ACCESS · TOUS LES SITES' : 'MEMBER ACCESS'}
              </p>
            </div>
            <button type="button" className="btn ghost small" onClick={() => void signOut()}>
              Se déconnecter
            </button>
          </div>

          <div className="tabs">
            <button
              type="button"
              className={`tab-btn${tab === 'mine' ? ' active' : ''}`}
              onClick={() => setTab('mine')}
            >
              Mes accès
            </button>
            <button
              type="button"
              className={`tab-btn${tab === 'account' ? ' active' : ''}`}
              onClick={() => setTab('account')}
            >
              Mon compte
            </button>
            {isAdmin ? (
              <button
                type="button"
                className={`tab-btn${tab === 'admin' ? ' active' : ''}`}
                onClick={() => setTab('admin')}
              >
                Administration
              </button>
            ) : null}
          </div>

          {tab === 'mine' ? (
            <MineView
              sites={visibleSites}
              grantedIds={grantedIds}
              pendingMap={pendingMap}
              isAdmin={isAdmin}
              error={mineError}
              onRequest={requestAccess}
            />
          ) : null}

          {tab === 'account' && user ? (
            <AccountView
              user={user}
              profile={profile}
              onProfile={(p) => setProfile((prev) => ({ ...prev, ...p }))}
            />
          ) : null}

          {tab === 'admin' && isAdmin && user ? (
            <AdminView
              user={user}
              supabaseUrl={supabaseUrl}
              anonKey={anonKey}
              onSitesChanged={() => void loadMine(user.id, true)}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

function ForcePasswordGate({ onDone }: { onDone: () => Promise<void> }) {
  const sb = createClient();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (p1 !== p2) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(sb, { newPassword: p1, clearTempFlag: true });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="force-gate">
      <div className="login-card">
        <p className="eyebrow">Sécurité</p>
        <h1>Mot de passe temporaire</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
          Votre compte a été créé avec un mot de passe provisoire. Choisissez un mot de passe
          personnel pour continuer.
        </p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <div className="field-label-row">
              <label htmlFor="forcePassword">Nouveau mot de passe</label>
              <span className="pwd-tip">
                <button type="button" aria-label="Exigences">
                  ?
                </button>
                <span className="pwd-tip-bubble" role="tooltip">
                  {PASSWORD_HINT}
                </span>
              </span>
            </div>
            <input
              id="forcePassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={p1}
              onChange={(e) => setP1(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="forcePasswordConfirm">Confirmer</label>
            <input
              id="forcePasswordConfirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={p2}
              onChange={(e) => setP2(e.target.value)}
            />
          </div>
          <button type="submit" className="btn full" disabled={busy}>
            Enregistrer
          </button>
          <p className="auth-error">{error}</p>
        </form>
      </div>
    </div>
  );
}

function MineView({
  sites,
  grantedIds,
  pendingMap,
  isAdmin,
  error,
  onRequest,
}: {
  sites: Site[];
  grantedIds: Set<string>;
  pendingMap: Map<string, string>;
  isAdmin: boolean;
  error: string | null;
  onRequest: (id: string) => void;
}) {
  if (error) {
    return (
      <div className="empty">
        <span className="eyebrow">Erreur</span>
        {error}
      </div>
    );
  }
  if (!sites.length) {
    return (
      <div className="empty">
        <span className="eyebrow">Aucun accès</span>
        Aucun site n&apos;est disponible pour ton compte.
      </div>
    );
  }

  return (
    <div className="grid">
      {sites.map((site) => {
        const color = site.color || '#4FD1C5';
        if (isAdmin || grantedIds.has(site.id)) {
          return (
            <a
              key={site.id}
              className="card available"
              style={{ ['--card-color' as string]: color }}
              href={resolveSiteHref(site)}
            >
              <span className="sweep" />
              <div className="card-top">
                <span className="card-icon">{site.icon || '🔗'}</span>
                <span className={`tag ${isAdmin ? 'admin' : 'granted'}`}>
                  {isAdmin ? 'Admin' : 'Autorisé'}
                </span>
              </div>
              <p className="card-name">{site.name}</p>
              <p className="card-desc">{site.description || ''}</p>
              <p className="card-open">OUVRIR →</p>
            </a>
          );
        }
        if (pendingMap.has(site.id)) {
          return (
            <div
              key={site.id}
              className="card locked"
              style={{ ['--card-color' as string]: color }}
            >
              <div className="card-top">
                <span className="card-icon">{site.icon || '🔗'}</span>
                <span className="tag pending">En attente</span>
              </div>
              <p className="card-name">{site.name}</p>
              <p className="card-desc">{site.description || ''}</p>
              <p className="card-locked-label">Demande envoyée, en attente de validation.</p>
            </div>
          );
        }
        return (
          <div
            key={site.id}
            className="card locked"
            style={{ ['--card-color' as string]: color }}
          >
            <div className="card-top">
              <span className="card-icon">{site.icon || '🔗'}</span>
              <span className="tag">Non autorisé</span>
            </div>
            <p className="card-name">{site.name}</p>
            <p className="card-desc">{site.description || ''}</p>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => onRequest(site.id)}
            >
              Demander l&apos;accès
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AccountView({
  user,
  profile,
  onProfile,
}: {
  user: User;
  profile: PortailProfile | null;
  onProfile: (p: PortailProfile) => void;
}) {
  const sb = createClient();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [nameMsg, setNameMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailStep, setEmailStep] = useState<'request' | 'confirm'>('request');
  const [emailMsg, setEmailMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [currentEmail, setCurrentEmail] = useState(user.email || profile?.email || '—');

  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    setDisplayName(profile?.display_name || '');
  }, [profile?.display_name]);

  return (
    <>
      <div className="account-card">
        <h3>Nom affiché</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setNameMsg(null);
            try {
              const row = await updateDisplayName(sb, user.id, displayName);
              onProfile(row);
              setNameMsg({ text: 'Nom enregistré.', ok: true });
            } catch (err) {
              setNameMsg({
                text: err instanceof Error ? err.message : String(err),
                ok: false,
              });
            }
          }}
        >
          <div className="field">
            <label htmlFor="accountDisplayName">Nom</label>
            <input
              id="accountDisplayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              placeholder="Prénom Nom"
            />
          </div>
          <button type="submit" className="btn small">
            Enregistrer
          </button>
          {nameMsg ? (
            <p
              style={{
                fontSize: 12,
                marginTop: 8,
                fontFamily: 'IBM Plex Mono, monospace',
                color: nameMsg.ok ? 'var(--teal)' : 'var(--amber)',
              }}
            >
              {nameMsg.text}
            </p>
          ) : null}
        </form>
      </div>

      <div className="account-card">
        <h3>Adresse e-mail</h3>
        <p className="row-sub" style={{ marginBottom: 10 }}>
          Actuel : <span>{currentEmail}</span>
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setEmailMsg(null);
            try {
              if (emailStep === 'request') {
                await requestEmailChange(sb, newEmail);
                setEmailStep('confirm');
                setEmailMsg({
                  text: 'Code OTP envoyé — saisissez-le ci-dessous.',
                  ok: true,
                });
              } else {
                await confirmEmailChangeOtp(sb, { email: newEmail, token: emailOtp });
                const {
                  data: { user: u },
                } = await sb.auth.getUser();
                setCurrentEmail(u?.email || newEmail);
                setEmailMsg({ text: 'E-mail mis à jour.', ok: true });
                setEmailStep('request');
                setNewEmail('');
                setEmailOtp('');
              }
            } catch (err) {
              setEmailMsg({
                text: err instanceof Error ? err.message : String(err),
                ok: false,
              });
            }
          }}
        >
          <div className="field">
            <label htmlFor="accountNewEmail">Nouvel e-mail</label>
            <input
              id="accountNewEmail"
              type="email"
              required
              disabled={emailStep === 'confirm'}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="nouveau@exemple.fr"
            />
          </div>
          {emailStep === 'confirm' ? (
            <div className="field">
              <label htmlFor="accountEmailOtp">Code OTP reçu par e-mail</label>
              <input
                id="accountEmailOtp"
                value={emailOtp}
                onChange={(e) => setEmailOtp(e.target.value)}
                inputMode="numeric"
                placeholder="6 chiffres"
              />
            </div>
          ) : null}
          <button type="submit" className="btn small">
            {emailStep === 'request' ? 'Demander le changement' : 'Confirmer le nouvel e-mail'}
          </button>
          {emailStep === 'confirm' ? (
            <button
              type="button"
              className="btn ghost small"
              style={{ marginLeft: 8 }}
              onClick={() => {
                setEmailStep('request');
                setEmailOtp('');
                setEmailMsg(null);
              }}
            >
              Annuler
            </button>
          ) : null}
          {emailMsg ? (
            <p
              style={{
                fontSize: 12,
                marginTop: 8,
                fontFamily: 'IBM Plex Mono, monospace',
                color: emailMsg.ok ? 'var(--teal)' : 'var(--amber)',
              }}
            >
              {emailMsg.text}
            </p>
          ) : null}
        </form>
      </div>

      <div className="account-card">
        <h3>Mot de passe</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPwdMsg(null);
            if (pwd1 !== pwd2) {
              setPwdMsg({ text: 'Les deux mots de passe ne correspondent pas.', ok: false });
              return;
            }
            try {
              await changePassword(sb, { newPassword: pwd1 });
              setPwdMsg({ text: 'Mot de passe mis à jour.', ok: true });
              setPwd1('');
              setPwd2('');
            } catch (err) {
              setPwdMsg({
                text: err instanceof Error ? err.message : String(err),
                ok: false,
              });
            }
          }}
        >
          <div className="field">
            <div className="field-label-row">
              <label htmlFor="accountNewPassword">Nouveau mot de passe</label>
              <span className="pwd-tip">
                <button type="button" aria-label="Exigences">
                  ?
                </button>
                <span className="pwd-tip-bubble" role="tooltip">
                  {PASSWORD_HINT}
                </span>
              </span>
            </div>
            <input
              id="accountNewPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={pwd1}
              onChange={(e) => setPwd1(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="accountNewPasswordConfirm">Confirmer</label>
            <input
              id="accountNewPasswordConfirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
            />
          </div>
          <button type="submit" className="btn small">
            Enregistrer le mot de passe
          </button>
          {pwdMsg ? (
            <p
              style={{
                fontSize: 12,
                marginTop: 8,
                fontFamily: 'IBM Plex Mono, monospace',
                color: pwdMsg.ok ? 'var(--teal)' : 'var(--amber)',
              }}
            >
              {pwdMsg.text}
            </p>
          ) : null}
        </form>
      </div>
    </>
  );
}

function AdminView({
  user,
  supabaseUrl,
  anonKey,
  onSitesChanged,
}: {
  user: User;
  supabaseUrl: string;
  anonKey: string;
  onSitesChanged: () => void;
}) {
  const sb = createClient();
  const [sites, setSites] = useState<Site[]>([]);
  const [profiles, setProfiles] = useState<
    { id: string; email: string; display_name: string | null; role: string | null }[]
  >([]);
  const [requests, setRequests] = useState<
    { id: string; user_id: string; site_id: string; requested_at: string }[]
  >([]);
  const [allAccess, setAllAccess] = useState<{ user_id: string; site_id: string }[]>([]);

  const [addMsg, setAddMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [editId, setEditId] = useState('');
  const [editMsg, setEditMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [inviteMsg, setInviteMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [inviteMode, setInviteMode] = useState<'temp_password' | 'invite_email'>('temp_password');

  const reload = useCallback(async () => {
    const [{ data: reqs }, { data: profs }, { data: access }, { data: siteRows }] =
      await Promise.all([
        sb
          .from('access_requests')
          .select('id, user_id, site_id, requested_at')
          .eq('status', 'pending')
          .order('requested_at'),
        sb.from('profiles').select('id, email, display_name, role').order('email'),
        sb.from('site_access').select('user_id, site_id'),
        sb
          .from('sites')
          .select('id, name, description, url, icon, color, is_active, visible_with_access_only')
          .order('name'),
      ]);
    setRequests((reqs || []) as typeof requests);
    setProfiles((profs || []) as typeof profiles);
    setAllAccess((access || []) as typeof allAccess);
    setSites((siteRows || []) as Site[]);
  }, [sb]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = sites.find((s) => s.id === editId);

  return (
    <>
      <div className="admin-section">
        <h2>Ajouter un nouveau site</h2>
        <form
          style={{
            background: 'var(--panel)',
            padding: 16,
            border: '1px solid var(--border)',
            borderRadius: 10,
          }}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setAddMsg(null);
            const { error } = await sb.from('sites').insert({
              name: String(fd.get('name') || '').trim(),
              url: String(fd.get('url') || '').trim(),
              description: String(fd.get('description') || '').trim(),
              icon: String(fd.get('icon') || '').trim() || '🔗',
              color: String(fd.get('color') || '#4FD1C5'),
            });
            if (error) setAddMsg({ text: 'Erreur: ' + error.message, ok: false });
            else {
              setAddMsg({ text: 'Site ajouté avec succès !', ok: true });
              e.currentTarget.reset();
              await reload();
              onSitesChanged();
            }
          }}
        >
          <div className="field">
            <label>Nom du site</label>
            <input name="name" required />
          </div>
          <div className="field">
            <label>URL</label>
            <input name="url" type="text" placeholder="/Banque/ ou https://…" required />
          </div>
          <div className="field">
            <label>Description</label>
            <input name="description" />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Icône</label>
              <input name="icon" placeholder="🔗" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Couleur</label>
              <input
                name="color"
                type="color"
                defaultValue="#4FD1C5"
                style={{ height: 42, padding: 4, cursor: 'pointer' }}
              />
            </div>
          </div>
          <button type="submit" className="btn small">
            Ajouter le site
          </button>
          {addMsg ? (
            <p
              style={{
                fontSize: 12,
                marginTop: 8,
                color: addMsg.ok ? 'var(--teal)' : 'var(--amber)',
                fontFamily: 'IBM Plex Mono, monospace',
              }}
            >
              {addMsg.text}
            </p>
          ) : null}
        </form>
      </div>

      <div className="admin-section">
        <h2>Modifier un site</h2>
        <form
          style={{
            background: 'var(--panel)',
            padding: 16,
            border: '1px solid var(--border)',
            borderRadius: 10,
          }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editId) return;
            const fd = new FormData(e.currentTarget);
            setEditMsg(null);
            const { error } = await sb
              .from('sites')
              .update({
                name: String(fd.get('name') || '').trim(),
                url: String(fd.get('url') || '').trim(),
                description: String(fd.get('description') || '').trim(),
                icon: String(fd.get('icon') || '').trim() || '🔗',
                color: String(fd.get('color') || '#4FD1C5'),
                is_active: fd.get('is_active') === 'on',
                visible_with_access_only: fd.get('visible_with_access_only') === 'on',
              })
              .eq('id', editId);
            if (error) setEditMsg({ text: 'Erreur: ' + error.message, ok: false });
            else {
              setEditMsg({ text: 'Site modifié avec succès !', ok: true });
              await reload();
              onSitesChanged();
            }
          }}
        >
          <div className="field">
            <label>Site à modifier</label>
            <select
              value={editId}
              onChange={(e) => {
                setEditId(e.target.value);
                setEditMsg(null);
              }}
              required
              style={{
                width: '100%',
                padding: '11px 13px',
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)',
              }}
            >
              <option value="">— Choisir un site —</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Nom</label>
            <input
              name="name"
              key={editId + '-name'}
              defaultValue={selected?.name || ''}
              required
              disabled={!editId}
            />
          </div>
          <div className="field">
            <label>URL</label>
            <input
              name="url"
              type="text"
              key={editId + '-url'}
              defaultValue={selected?.url || ''}
              required
              disabled={!editId}
              placeholder="/Banque/ ou https://…"
            />
          </div>
          <div className="field">
            <label>Description</label>
            <input
              name="description"
              key={editId + '-desc'}
              defaultValue={selected?.description || ''}
              disabled={!editId}
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Icône</label>
              <input
                name="icon"
                key={editId + '-icon'}
                defaultValue={selected?.icon || ''}
                disabled={!editId}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Couleur</label>
              <input
                name="color"
                type="color"
                key={editId + '-color'}
                defaultValue={selected?.color || '#4FD1C5'}
                disabled={!editId}
                style={{ height: 42, padding: 4, cursor: 'pointer' }}
              />
            </div>
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              name="is_active"
              key={editId + '-active'}
              defaultChecked={selected?.is_active !== false}
              disabled={!editId}
              style={{ width: 'auto', accentColor: 'var(--teal)' }}
            />
            <label style={{ margin: 0 }}>Site actif</label>
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input
              type="checkbox"
              name="visible_with_access_only"
              key={editId + '-vis'}
              defaultChecked={!!selected?.visible_with_access_only}
              disabled={!editId}
              style={{ width: 'auto', accentColor: 'var(--teal)', marginTop: 3 }}
            />
            <label style={{ margin: 0 }}>
              Visible uniquement si accès validé
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  color: 'var(--muted)',
                  fontWeight: 400,
                  marginTop: 2,
                }}
              >
                Masque la carte aux utilisateurs sans accès (les admins voient toujours tout).
              </span>
            </label>
          </div>
          <button type="submit" className="btn small" disabled={!editId}>
            Enregistrer les modifications
          </button>
          {editMsg ? (
            <p
              style={{
                fontSize: 12,
                marginTop: 8,
                color: editMsg.ok ? 'var(--teal)' : 'var(--amber)',
                fontFamily: 'IBM Plex Mono, monospace',
              }}
            >
              {editMsg.text}
            </p>
          ) : null}
        </form>
      </div>

      <div className="admin-section">
        <h2>Inviter un utilisateur</h2>
        <form
          style={{
            background: 'var(--panel)',
            padding: 16,
            border: '1px solid var(--border)',
            borderRadius: 10,
          }}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setInviteMsg(null);
            const {
              data: { session },
            } = await sb.auth.getSession();
            if (!session) {
              setInviteMsg({ text: 'Session expirée.', ok: false });
              return;
            }
            const mode = inviteMode;
            const payload: Record<string, string> = {
              email: String(fd.get('email') || '').trim(),
              display_name:
                String(fd.get('display_name') || '').trim() ||
                String(fd.get('email') || '').trim(),
              role: String(fd.get('role') || 'member'),
              mode,
            };
            if (mode === 'temp_password') {
              const pwd = String(fd.get('password') || '');
              const weak = validatePassword(pwd);
              if (weak) {
                setInviteMsg({ text: weak, ok: false });
                return;
              }
              payload.password = pwd;
            }
            const res = await fetch(`${supabaseUrl}/functions/v1/invite-user`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
                apikey: anonKey,
              },
              body: JSON.stringify(payload),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
              setInviteMsg({
                text: (body as { error?: string }).error || 'Erreur lors de la création.',
                ok: false,
              });
              return;
            }
            setInviteMsg({
              text:
                mode === 'invite_email'
                  ? 'Invitation envoyée. La personne utilise « J’ai reçu une invitation » à la connexion.'
                  : 'Compte créé (mot de passe temporaire). Changement forcé à la 1ʳᵉ connexion.',
              ok: true,
            });
            e.currentTarget.reset();
            setInviteMode('temp_password');
            await reload();
          }}
        >
          <div className="field" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                checked={inviteMode === 'temp_password'}
                onChange={() => setInviteMode('temp_password')}
                style={{ width: 'auto', accentColor: 'var(--teal)' }}
              />
              Mot de passe temporaire
            </label>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                checked={inviteMode === 'invite_email'}
                onChange={() => setInviteMode('invite_email')}
                style={{ width: 'auto', accentColor: 'var(--teal)' }}
              />
              Invitation par e-mail (OTP)
            </label>
          </div>
          <div className="field">
            <label>Email</label>
            <input name="email" type="email" required autoComplete="off" />
          </div>
          {inviteMode === 'temp_password' ? (
            <div className="field">
              <div className="field-label-row">
                <label>Mot de passe temporaire</label>
                <span className="pwd-tip">
                  <button type="button" aria-label="Exigences">
                    ?
                  </button>
                  <span className="pwd-tip-bubble" role="tooltip">
                    {PASSWORD_HINT}
                  </span>
                </span>
              </div>
              <input name="password" type="password" required minLength={8} autoComplete="new-password" />
            </div>
          ) : null}
          <div className="field">
            <label>Nom affiché</label>
            <input name="display_name" />
          </div>
          <div className="field">
            <label>Rôle</label>
            <select
              name="role"
              defaultValue="member"
              style={{
                width: '100%',
                padding: '11px 13px',
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)',
              }}
            >
              <option value="member">member</option>
              <option value="équipe">équipe</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button type="submit" className="btn small">
            {inviteMode === 'invite_email' ? 'Envoyer l’invitation' : 'Créer le compte'}
          </button>
          {inviteMsg ? (
            <p
              style={{
                fontSize: 12,
                marginTop: 8,
                color: inviteMsg.ok ? 'var(--teal)' : 'var(--amber)',
                fontFamily: 'IBM Plex Mono, monospace',
              }}
            >
              {inviteMsg.text}
            </p>
          ) : null}
        </form>
      </div>

      <div className="admin-section">
        <h2>Demandes en attente</h2>
        {!requests.length ? (
          <div className="empty">Aucune demande en attente.</div>
        ) : (
          requests.map((r) => {
            const p = profiles.find((x) => x.id === r.user_id);
            const s = sites.find((x) => x.id === r.site_id);
            return (
              <div className="row" key={r.id}>
                <div className="row-info">
                  <span className="row-title">
                    {p?.display_name || p?.email || 'Utilisateur'} → {s?.icon || ''}{' '}
                    {s?.name || 'Site'}
                  </span>
                  <span className="row-sub">
                    Demandé le {new Date(r.requested_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn small"
                    onClick={async () => {
                      await sb
                        .from('access_requests')
                        .update({ status: 'approved', reviewed_by: user.id })
                        .eq('id', r.id);
                      await sb
                        .from('site_access')
                        .upsert(
                          { user_id: r.user_id, site_id: r.site_id },
                          { onConflict: 'user_id,site_id' },
                        );
                      await reload();
                      onSitesChanged();
                    }}
                  >
                    Approuver
                  </button> <button
                    type="button"
                    className="btn ghost small"
                    onClick={async () => {
                      await sb
                        .from('access_requests')
                        .update({ status: 'rejected', reviewed_by: user.id })
                        .eq('id', r.id);
                      await reload();
                    }}
                  >
                    Refuser
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="admin-section">
        <h2>Utilisateurs</h2>
        <p
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            margin: '-6px 0 14px',
            fontFamily: 'IBM Plex Mono, monospace',
          }}
        >
          Accorder / retirer des sites, ou supprimer un compte (irréversible). Impossible sur votre
          propre compte.
        </p>
        {profiles.map((p) => {
          const granted = allAccess.filter((a) => a.user_id === p.id).map((a) => a.site_id);
          const options = sites.filter((s) => !granted.includes(s.id));
          return (
            <div
              className="row"
              key={p.id}
              style={{ flexDirection: 'column', alignItems: 'stretch' }}
            >
              <div
                className="row"
                style={{ border: 'none', padding: 0, margin: 0, background: 'transparent' }}
              >
                <div className="row-info">
                  <span className="row-title">{p.display_name || p.email}</span>
                  <span className="row-sub">
                    {p.email} · {p.role === 'admin' ? 'ADMIN' : 'MEMBER'}
                  </span>
                </div>
                <div className="row-actions">
                  {p.id === user.id ? (
                    <span className="row-sub">Vous</span>
                  ) : (
                    <button
                      type="button"
                      className="btn ghost small danger"
                      onClick={async () => {
                        const name = p.display_name || p.email;
                        if (
                          !confirm(
                            `Supprimer définitivement le compte « ${name} » ?\n\nCette action est irréversible.`,
                          )
                        )
                          return;
                        if (!confirm('Confirmez une dernière fois la suppression de ce compte.'))
                          return;
                        const {
                          data: { session },
                        } = await sb.auth.getSession();
                        if (!session?.access_token) {
                          alert('Session expirée — reconnectez-vous.');
                          return;
                        }
                        const res = await fetch(`${supabaseUrl}/functions/v1/delete-user`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${session.access_token}`,
                            apikey: anonKey,
                          },
                          body: JSON.stringify({ user_id: p.id }),
                        });
                        const payload = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          alert(
                            (payload as { error?: string }).error ||
                              `Suppression impossible (${res.status}).`,
                          );
                          return;
                        }
                        await reload();
                      }}
                    >
                      Supprimer le compte
                    </button>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                {granted.length
                  ? granted.map((sid) => {
                      const s = sites.find((x) => x.id === sid);
                      return (
                        <span className="chip" key={sid}>
                          {s?.icon || ''} {s?.name || sid}{' '}
                          <button
                            type="button"
                            onClick={async () => {
                              await sb
                                .from('site_access')
                                .delete()
                                .eq('user_id', p.id)
                                .eq('site_id', sid);
                              await reload();
                              onSitesChanged();
                            }}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })
                  : (
                    <span className="row-sub">Aucun accès</span>
                  )}
              </div>
              {options.length ? (
                <div className="grant-form">
                  <select id={`grant-${p.id}`} defaultValue={options[0].id}>
                    {options.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn small"
                    onClick={async () => {
                      const sel = document.getElementById(
                        `grant-${p.id}`,
                      ) as HTMLSelectElement | null;
                      const siteId = sel?.value;
                      if (!siteId) return;
                      await sb.from('site_access').insert({ user_id: p.id, site_id: siteId });
                      await reload();
                      onSitesChanged();
                    }}
                  >
                    Accorder
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
