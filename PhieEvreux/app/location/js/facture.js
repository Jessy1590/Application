/**
 * Module Facture — vérification matricules facture prestataire vs dossiers.
 * Uniquement les appareils source = prestataire.
 *
 * Normal : matricule sur facture + dossier non clôturé
 * Anomalie : matricule sur facture + dossier clôturé depuis moins du délai
 * Anomalie : dossier non clôturé dont le matricule n’est pas sur la facture
 * Anomalie : matricule sur facture sans dossier prestataire correspondant
 */
(function (global) {
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  let helpTipSeq = 0;

  function helpTipHtml(text, ariaLabel, bubbleId) {
    helpTipSeq += 1;
    const id = bubbleId || `loc-help-tip-fa-${helpTipSeq}`;
    return `<span class="loc-help-tip">
      <button type="button" class="loc-help-tip__btn" aria-label="${esc(ariaLabel)}" aria-expanded="false" aria-controls="${id}">?</button>
      <span class="loc-help-tip__bubble" role="tooltip" id="${id}">${esc(text)}</span>
    </span>`;
  }

  function closeHelpTips(root, except) {
    (root || document).querySelectorAll('.loc-help-tip.is-open').forEach((wrap) => {
      if (except && wrap === except) return;
      wrap.classList.remove('is-open');
      const btn = wrap.querySelector('.loc-help-tip__btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function bindHelpTips(root) {
    if (!root) return;
    root.querySelectorAll('.loc-help-tip').forEach((wrap) => {
      const btn = wrap.querySelector('.loc-help-tip__btn');
      if (!btn || btn.dataset.helpBound === '1') return;
      btn.dataset.helpBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const willOpen = !wrap.classList.contains('is-open');
        closeHelpTips(root, wrap);
        wrap.classList.toggle('is-open', willOpen);
        btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        if (!willOpen) btn.blur();
      });
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeHelpTips(root);
          btn.blur();
        }
      });
    });
    if (root.dataset.helpOutsideBound === '1') return;
    root.dataset.helpOutsideBound = '1';
    root.addEventListener('click', (e) => {
      if (e.target.closest('.loc-help-tip')) return;
      closeHelpTips(root);
    });
  }

  function infoBanner(bodyHtml) {
    return `<div class="loc-info-banner" role="note">
      <p class="loc-info-banner-title">Information</p>
      <div class="loc-info-banner-body">${bodyHtml}</div>
    </div>`;
  }

  function parseMatricules(text) {
    const parts = String(text || '')
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const p of parts) {
      const key = p.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  }

  function norm(s) {
    return String(s || '').trim().toLowerCase();
  }

  function isPrestataire(a) {
    return a?.source === 'prestataire';
  }

  /** Matricule prestataire uniquement. */
  function appareilKeys(a) {
    if (!isPrestataire(a)) return [];
    const m = norm(a?.matricule);
    return m ? [m] : [];
  }

  function patientLabel(d) {
    const p = d.patient || {};
    const name = [p.nom, p.prenom].filter(Boolean).join(' ').trim();
    return name || '—';
  }

  function daysSinceDate(iso) {
    if (!iso) return null;
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.floor((today - then) / 86400000);
  }

  function displayMatricule(a, matchedKey) {
    const m = String(a?.matricule || '').trim();
    if (matchedKey && norm(m) === matchedKey) return m || matchedKey;
    return m || matchedKey || '—';
  }

  function canSuivi(ctx) {
    return typeof ctx.can === 'function' ? ctx.can('module_suivi') : true;
  }

  function canCloture(ctx, d) {
    if (!d || d.statut === 'cloture' || d.statut === 'annule' || d.statut === 'en_attente') return false;
    return typeof ctx.can === 'function' ? ctx.can('module_cloture') : true;
  }

  function dossierActionsHtml(d, ctx) {
    const id = d?.id || '';
    if (!id) return '';
    const parts = [];
    if (canSuivi(ctx)) {
      parts.push(
        `<button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-suivi="${esc(id)}" title="Ouvrir Suivi" aria-label="Ouvrir Suivi">✎</button>`
      );
    }
    if (canCloture(ctx, d)) {
      parts.push(`<span class="loc-help-tip">
        <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-cloture="${esc(id)}" aria-label="Clôturer le dossier">C</button>
        <span class="loc-help-tip__bubble" role="tooltip">Clôturer le dossier</span>
      </span>`);
    }
    if (!parts.length) return '';
    return `<div class="loc-dossier-actions">${parts.join('')}</div>`;
  }

  function bindDossierActions(root, ctx) {
    root.querySelectorAll('[data-suivi]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-suivi');
        if (id) ctx.openSuivi?.(id);
      });
    });
    root.querySelectorAll('[data-cloture]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-cloture');
        if (id) ctx.openSuivi?.(id, { cloture: true });
      });
    });
  }

  function findInvoiceHit(d, invoiceSet) {
    for (const a of d.appareils || []) {
      for (const k of appareilKeys(a)) {
        if (invoiceSet.has(k)) {
          return { hitKey: k, hitApp: a };
        }
      }
    }
    return null;
  }

  function firstPrestataireApp(d) {
    const prest = (d.appareils || []).filter((a) => appareilKeys(a).length);
    const actif = prest.find((a) => a.actif);
    return actif || prest[0] || null;
  }

  /**
   * @returns {{
   *   normaux: object[],
   *   factureMaisClotures: object[],
   *   ouvertsAbsents: object[],
   *   sansDossier: object[],
   *   delaiJours: number
   * }}
   */
  function classify(dossiers, invoiceMats, delaiJours) {
    const delai = Number.isFinite(Number(delaiJours)) && Number(delaiJours) >= 0 ? Number(delaiJours) : 30;
    const invoiceList = invoiceMats || [];
    const invoiceSet = new Set(invoiceList.map(norm));
    const matchedKeys = new Set();
    const normaux = [];
    const factureMaisClotures = [];
    const ouvertsAbsents = [];
    const seenOk = new Set();
    const seenClosed = new Set();
    const seenAbsent = new Set();

    for (const d of dossiers || []) {
      const cloture = d.statut === 'cloture';
      const hit = findInvoiceHit(d, invoiceSet);

      if (hit) {
        matchedKeys.add(hit.hitKey);
        const row = {
          dossier: d,
          matchedKey: hit.hitKey,
          matchedApp: hit.hitApp,
          matriculeAffiche: displayMatricule(hit.hitApp, hit.hitKey),
        };
        if (!cloture) {
          if (!seenOk.has(d.id)) {
            seenOk.add(d.id);
            normaux.push(row);
          }
        } else {
          const days = daysSinceDate(d.date_cloture);
          const tropRecent = days == null || days < delai;
          if (tropRecent && !seenClosed.has(d.id)) {
            seenClosed.add(d.id);
            factureMaisClotures.push(row);
          }
        }
        continue;
      }

      if (!cloture) {
        const app = firstPrestataireApp(d);
        if (!app) continue;
        const keys = appareilKeys(app);
        if (keys.some((k) => invoiceSet.has(k))) continue;
        if (seenAbsent.has(d.id)) continue;
        seenAbsent.add(d.id);
        ouvertsAbsents.push({
          dossier: d,
          matchedKey: keys[0] || null,
          matchedApp: app,
          matriculeAffiche: displayMatricule(app, keys[0] || null),
        });
      }
    }

    const sansDossier = invoiceList
      .filter((m) => !matchedKeys.has(norm(m)))
      .map((m) => ({
        matriculeAffiche: m,
        matchedKey: norm(m),
        dossier: null,
      }));

    const byPatient = (a, b) => patientLabel(a.dossier).localeCompare(patientLabel(b.dossier), 'fr');
    normaux.sort(byPatient);
    factureMaisClotures.sort(byPatient);
    ouvertsAbsents.sort(byPatient);
    sansDossier.sort((a, b) =>
      String(a.matriculeAffiche).localeCompare(String(b.matriculeAffiche), 'fr')
    );
    return { normaux, factureMaisClotures, ouvertsAbsents, sansDossier, delaiJours: delai };
  }

  function renderRow(item, { warn, ctx } = {}) {
    const d = item.dossier;
    if (!d) {
      return `<li class="loc-facture-item${warn ? ' loc-facture-item-warn' : ' loc-facture-item-ok'}">
        <strong>Aucun dossier</strong>
        <span>Matricule : ${esc(item.matriculeAffiche)}</span>
      </li>`;
    }
    return `<li class="loc-facture-item${warn ? ' loc-facture-item-warn' : ' loc-facture-item-ok'}">
      <div class="loc-facture-item-main">
        <strong>${esc(patientLabel(d))}</strong>
        <span>Dossier ${esc(d.id || '—')} · ${esc(d.statut || '—')}</span>
        <span>Matricule : ${esc(item.matriculeAffiche)}</span>
        <span>Date clôture : ${esc(d.date_cloture || '—')}</span>
      </div>
      ${dossierActionsHtml(d, ctx || {})}
    </li>`;
  }

  function fillList(listEl, emptyEl, rows, warn, ctx) {
    listEl.innerHTML = rows.map((r) => renderRow(r, { warn, ctx })).join('');
    emptyEl.hidden = rows.length > 0;
    if (ctx) bindDossierActions(listEl, ctx);
  }

  async function mount(root, ctx) {
    root.innerHTML = '';
    let delaiJours = 30;
    try {
      const params = await LocationData.loadParams();
      const n = Number(params.facture_delai_cloture_jours);
      if (Number.isFinite(n) && n >= 0) delaiJours = n;
    } catch (_) {
      /* défaut 30 */
    }

    const wrap = el(`<div class="loc-module loc-facture">
      ${infoBanner(`<p>Collez les matricules de la facture (ligne, virgule ou espace). Dossiers prestataire uniquement. Seuil du délai de clôture : <strong id="faDelai">${delaiJours}</strong> j.</p>`)}
      <label class="loc-field">Matricules facture
        <textarea id="faMats" rows="8" placeholder="Ex.&#10;ABC123&#10;PH-0042&#10;XYZ789"></textarea>
      </label>
      <div class="loc-toolbar">
        <button type="button" class="loc-btn" id="faVerify">Vérifier</button>
      </div>
      <p class="loc-msg" id="faMsg" hidden></p>
      <div class="loc-facture-results" id="faResults" hidden>
        <section class="loc-facture-block">
          <div class="loc-field-label-row">
            <h3 class="loc-facture-title loc-facture-title-ok">Normaux</h3>
            ${helpTipHtml('Matricule sur la facture et dossier prestataire non clôturé.', 'Aide : Normaux')}
          </div>
          <ul class="loc-facture-list" id="faListOk"></ul>
          <p class="loc-muted" id="faEmptyOk" hidden>Aucun.</p>
        </section>
        <section class="loc-facture-block">
          <div class="loc-field-label-row">
            <h3 class="loc-facture-title loc-facture-title-warn">Sur facture mais clôturés</h3>
            ${helpTipHtml(
              `Matricule sur la facture et dossier prestataire clôturé depuis moins de ${delaiJours} j.`,
              'Aide : Sur facture mais clôturés',
              'faTipClosed'
            )}
          </div>
          <ul class="loc-facture-list" id="faListClosed"></ul>
          <p class="loc-muted" id="faEmptyClosed" hidden>Aucun.</p>
        </section>
        <section class="loc-facture-block">
          <div class="loc-field-label-row">
            <h3 class="loc-facture-title loc-facture-title-warn">Ouverts absents de la facture</h3>
            ${helpTipHtml('Dossier prestataire non clôturé dont le matricule n’apparaît pas sur la facture.', 'Aide : Ouverts absents de la facture')}
          </div>
          <ul class="loc-facture-list" id="faListAbsent"></ul>
          <p class="loc-muted" id="faEmptyAbsent" hidden>Aucun.</p>
        </section>
        <section class="loc-facture-block">
          <div class="loc-field-label-row">
            <h3 class="loc-facture-title loc-facture-title-warn">Matricules sans dossier</h3>
            ${helpTipHtml('Matricule sur la facture sans dossier prestataire correspondant.', 'Aide : Matricules sans dossier')}
          </div>
          <ul class="loc-facture-list" id="faListOrphan"></ul>
          <p class="loc-muted" id="faEmptyOrphan" hidden>Aucun.</p>
        </section>
      </div>
    </div>`);
    root.appendChild(wrap);
    bindHelpTips(wrap);

    const msgEl = wrap.querySelector('#faMsg');
    const results = wrap.querySelector('#faResults');

    function showMsg(t, err) {
      msgEl.hidden = !t;
      msgEl.textContent = t || '';
      msgEl.classList.toggle('loc-msg-err', !!err);
    }

    wrap.querySelector('#faVerify').addEventListener('click', async () => {
      const mats = parseMatricules(wrap.querySelector('#faMats').value);
      if (!mats.length) {
        results.hidden = true;
        return showMsg('Saisissez au moins un matricule.', true);
      }
      showMsg('Vérification…');
      results.hidden = true;
      try {
        const params = await LocationData.loadParams();
        let delai = Number(params.facture_delai_cloture_jours);
        if (!Number.isFinite(delai) || delai < 0) delai = 30;
        delaiJours = delai;
        wrap.querySelector('#faDelai').textContent = String(delai);
        const tipClosed = wrap.querySelector('#faTipClosed');
        if (tipClosed) {
          tipClosed.textContent = `Matricule sur la facture et dossier prestataire clôturé depuis moins de ${delai} j.`;
        }

        const dossiers = await LocationData.listDossiers({});
        const { normaux, factureMaisClotures, ouvertsAbsents, sansDossier } = classify(
          dossiers,
          mats,
          delai
        );

        fillList(wrap.querySelector('#faListOk'), wrap.querySelector('#faEmptyOk'), normaux, false, ctx);
        fillList(
          wrap.querySelector('#faListClosed'),
          wrap.querySelector('#faEmptyClosed'),
          factureMaisClotures,
          true,
          ctx
        );
        fillList(
          wrap.querySelector('#faListAbsent'),
          wrap.querySelector('#faEmptyAbsent'),
          ouvertsAbsents,
          true,
          ctx
        );
        fillList(
          wrap.querySelector('#faListOrphan'),
          wrap.querySelector('#faEmptyOrphan'),
          sansDossier,
          true,
          ctx
        );

        results.hidden = false;
        showMsg(
          `${mats.length} matricule(s) · ${normaux.length} normal(aux) · ${factureMaisClotures.length} clôturé(s) < ${delai} j · ${ouvertsAbsents.length} ouvert(s) absent(s) · ${sansDossier.length} sans dossier.`
        );
      } catch (e) {
        showMsg(e.message || 'Erreur', true);
      }
    });
  }

  global.LocationFacture = { mount, parseMatricules, classify };
})(window);
