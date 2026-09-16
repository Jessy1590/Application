/**
 * Module Facture — vérification matricules facture prestataire vs dossiers.
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

  /** Matricules d’un appareil (matricule + n° pharmacie si renseignés). */
  function appareilKeys(a) {
    const keys = [];
    const m = norm(a?.matricule);
    const n = norm(a?.numero_pharmacie);
    if (m) keys.push(m);
    if (n && n !== m) keys.push(n);
    return keys;
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
    const n = String(a?.numero_pharmacie || '').trim();
    if (matchedKey && norm(m) === matchedKey) return m || matchedKey;
    if (matchedKey && norm(n) === matchedKey) return n || matchedKey;
    return m || n || '—';
  }

  /**
   * Pour chaque matricule facture, trouve les dossiers dont un appareil matche.
   * @returns {{ nonClotures: object[], valides: object[], delaiJours: number }}
   */
  function classify(dossiers, invoiceMats, delaiJours) {
    const invoiceSet = new Set(invoiceMats.map(norm));
    const nonClotures = [];
    const valides = [];
    const seenA = new Set();
    const seenB = new Set();

    for (const d of dossiers || []) {
      const apps = d.appareils || [];
      let hitKey = null;
      let hitApp = null;
      for (const a of apps) {
        for (const k of appareilKeys(a)) {
          if (invoiceSet.has(k)) {
            hitKey = k;
            hitApp = a;
            break;
          }
        }
        if (hitKey) break;
      }
      if (!hitKey) continue;

      const row = {
        dossier: d,
        matchedKey: hitKey,
        matchedApp: hitApp,
        matriculeAffiche: displayMatricule(hitApp, hitKey),
      };

      if (d.statut !== 'cloture') {
        if (!seenA.has(d.id)) {
          seenA.add(d.id);
          nonClotures.push(row);
        }
      } else {
        const days = daysSinceDate(d.date_cloture);
        if (days != null && days >= delaiJours) {
          if (!seenB.has(d.id)) {
            seenB.add(d.id);
            valides.push(row);
          }
        }
      }
    }

    nonClotures.sort((a, b) => patientLabel(a.dossier).localeCompare(patientLabel(b.dossier), 'fr'));
    valides.sort((a, b) => patientLabel(a.dossier).localeCompare(patientLabel(b.dossier), 'fr'));
    return { nonClotures, valides, delaiJours };
  }

  function renderRow(item, { warn } = {}) {
    const d = item.dossier;
    return `<li class="loc-facture-item${warn ? ' loc-facture-item-warn' : ' loc-facture-item-ok'}">
      <strong>${esc(patientLabel(d))}</strong>
      <span>Dossier ${esc(d.id || '—')} · ${esc(d.statut || '—')}</span>
      <span>Matricule : ${esc(item.matriculeAffiche)}</span>
      <span>Date clôture : ${esc(d.date_cloture || '—')}</span>
    </li>`;
  }

  async function mount(root) {
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
      <p class="loc-muted">Collez les matricules présents sur la facture (un par ligne, ou séparés par virgule / espace). Délai de clôture requis : <strong id="faDelai">${delaiJours}</strong> j.</p>
      <label class="loc-field">Matricules facture
        <textarea id="faMats" rows="8" placeholder="Ex.&#10;ABC123&#10;PH-0042&#10;XYZ789"></textarea>
      </label>
      <div class="loc-toolbar">
        <button type="button" class="loc-btn" id="faVerify">Vérifier</button>
      </div>
      <p class="loc-msg" id="faMsg" hidden></p>
      <div class="loc-facture-results" id="faResults" hidden>
        <section class="loc-facture-block">
          <h3 class="loc-facture-title loc-facture-title-warn">Dossiers non clôturés</h3>
          <p class="loc-muted loc-facture-hint">Matricule sur la facture alors que le dossier est encore ouvert.</p>
          <ul class="loc-facture-list" id="faListA"></ul>
          <p class="loc-muted" id="faEmptyA" hidden>Aucun.</p>
        </section>
        <section class="loc-facture-block">
          <h3 class="loc-facture-title loc-facture-title-ok">Dossiers valides pour facture</h3>
          <p class="loc-muted loc-facture-hint" id="faHintB">Matricule présent, dossier clôturé depuis au moins ${delaiJours} j.</p>
          <ul class="loc-facture-list" id="faListB"></ul>
          <p class="loc-muted" id="faEmptyB" hidden>Aucun.</p>
        </section>
      </div>
    </div>`);
    root.appendChild(wrap);

    const msgEl = wrap.querySelector('#faMsg');
    const results = wrap.querySelector('#faResults');
    const listA = wrap.querySelector('#faListA');
    const listB = wrap.querySelector('#faListB');
    const emptyA = wrap.querySelector('#faEmptyA');
    const emptyB = wrap.querySelector('#faEmptyB');

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
        const hintB = wrap.querySelector('#faHintB');
        if (hintB) {
          hintB.textContent = `Matricule présent, dossier clôturé depuis au moins ${delai} j.`;
        }

        const dossiers = await LocationData.listDossiers({});
        const { nonClotures, valides } = classify(dossiers, mats, delai);

        listA.innerHTML = nonClotures.map((r) => renderRow(r, { warn: true })).join('');
        listB.innerHTML = valides.map((r) => renderRow(r, { warn: false })).join('');
        emptyA.hidden = nonClotures.length > 0;
        emptyB.hidden = valides.length > 0;
        results.hidden = false;
        showMsg(
          `${mats.length} matricule(s) · ${nonClotures.length} non clôturé(s) · ${valides.length} valide(s).`
        );
      } catch (e) {
        showMsg(e.message || 'Erreur', true);
      }
    });
  }

  global.LocationFacture = { mount, parseMatricules, classify };
})(window);
