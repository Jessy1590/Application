/**
 * Module Contact — file règles, pas-à-pas comptoir, templates, impression.
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

  const RESULTATS = [
    { code: 'ramene_semaine', label: 'Ramène cette semaine' },
    { code: 'ordo_mail', label: 'Ordo par mail' },
    { code: 'ordo_mail_a_faire', label: 'Ordo mail à faire' },
    { code: 'message_repondeur', label: 'Message répondeur' },
    { code: 'message_laisse', label: 'Message laissé' },
    { code: 'raccroche', label: 'A raccroché' },
    { code: 'mauvais_numero', label: 'Mauvais numéro' },
    { code: 'pas_de_numero', label: 'Pas de numéro' },
    { code: 'autre_raison', label: 'Autre' },
  ];

  async function mount(root, ctx) {
    root.innerHTML = '';
    const wrap = el(`<div class="loc-module">
      <div class="loc-toolbar">
        <button type="button" class="loc-btn" id="coSync">Synchroniser la file</button>
        <button type="button" class="loc-btn loc-btn-ghost" id="coPrint">Imprimer la liste</button>
        <span class="loc-muted" id="coCount"></span>
      </div>
      <div class="loc-split">
        <div class="loc-list" id="coList"></div>
        <div class="loc-detail" id="coFlow"><p class="loc-muted">Sélectionnez un patient à contacter.</p></div>
      </div>
      <p class="loc-msg" id="coMsg" hidden></p>
    </div>`);
    root.appendChild(wrap);

    let items = [];
    let current = null;
    let step = 0;
    const draft = { commentaire: '', resultat: null, canal: 'telephone', after: null };

    const listEl = wrap.querySelector('#coList');
    const flowEl = wrap.querySelector('#coFlow');
    const msgEl = wrap.querySelector('#coMsg');
    const countEl = wrap.querySelector('#coCount');

    function showMsg(t, err) {
      msgEl.hidden = !t;
      msgEl.textContent = t || '';
      msgEl.classList.toggle('loc-msg-err', !!err);
    }

    async function refresh() {
      showMsg('Chargement…');
      try {
        items = await LocationData.listOpenContacts();
        countEl.textContent = `${items.length} en file`;
        showMsg('');
        renderList();
        if (current) {
          const still = items.find((i) => i.id === current.id);
          if (still) {
            current = still;
            renderFlow();
          } else {
            current = null;
            flowEl.innerHTML = '<p class="loc-muted">Sélectionnez un patient à contacter.</p>';
          }
        }
      } catch (e) {
        showMsg(e.message || 'Erreur', true);
      }
    }

    function renderList() {
      if (!items.length) {
        listEl.innerHTML = '<p class="loc-muted">File vide. Synchronisez pour recalculer selon les règles.</p>';
        return;
      }
      listEl.innerHTML = items
        .map((it) => {
          const p = it.dossier?.patient || {};
          return `<button type="button" class="loc-list-item${current?.id === it.id ? ' active' : ''}" data-id="${it.id}">
            <strong>${esc(p.nom)} ${esc(p.prenom)}</strong>
            <span>${esc(it.motif || '')} · ${esc(it.statut)}</span>
            <span class="loc-badge">${esc(it.dossier?.date_fin || '—')}</span>
          </button>`;
        })
        .join('');
      listEl.querySelectorAll('[data-id]').forEach((b) => {
        b.addEventListener('click', () => {
          current = items.find((i) => i.id === b.dataset.id);
          step = 0;
          draft.commentaire = current?.commentaire || '';
          draft.resultat = null;
          draft.after = null;
          draft.canal = 'telephone';
          renderList();
          renderFlow();
        });
      });
    }

    function stepCard(title, actionsHtml, extraHtml = '') {
      return `<div class="loc-step-card">
        <h4>${esc(title)}</h4>
        ${extraHtml}
        <div class="loc-step-actions">${actionsHtml}</div>
      </div>`;
    }

    function renderFlow() {
      if (!current) return;
      const d = current.dossier || {};
      const p = d.patient || {};
      const tels = (p.telephones || []).join(' · ') || 'Pas de numéro';
      const header = `<div class="loc-detail-head">
        <div>
          <h3>${esc(p.nom)} ${esc(p.prenom)}</h3>
          <p class="loc-muted">${esc(tels)} · fin ${esc(d.date_fin || '—')} · ${esc(LocationRules.typeLabel(d.appareil_actif?.type_appareil))}</p>
        </div>
      </div>`;

      let body = '';
      if (step === 0) {
        body = stepCard(
          '1 — Vérifier / adapter le commentaire (comptoir)',
          `<button type="button" class="loc-btn" id="coNext1">Commentaire OK — passer à l’appel</button>`,
          `<label class="loc-field">Commentaire prérempli (modifiable)
            <textarea id="coComment" rows="4">${esc(draft.commentaire)}</textarea>
          </label>
          <p class="loc-hint">Motif : ${esc(current.motif || '')}</p>`
        );
      } else if (step === 1) {
        body = stepCard(
          '2 — Avez-vous joint le patient ?',
          `
          <button type="button" class="loc-btn" data-go="2">Oui — appel fait</button>
          <button type="button" class="loc-btn loc-btn-ghost" data-go="3">Non — pas d’appel</button>
          <button type="button" class="loc-btn loc-btn-ghost" id="coBack0">Retour</button>
          `
        );
      } else if (step === 2) {
        body = stepCard(
          '3 — Résultat de l’appel',
          RESULTATS.map((r) => `<button type="button" class="loc-btn loc-btn-ghost" data-res="${r.code}">${esc(r.label)}</button>`).join('') +
            `<button type="button" class="loc-btn loc-btn-ghost" id="coBack1">Retour</button>`,
          `<label class="loc-field">Canal
            <select id="coCanal">
              <option value="telephone">Téléphone</option>
              <option value="mail">Mail</option>
              <option value="comptoir">Comptoir</option>
            </select>
          </label>`
        );
      } else if (step === 3) {
        body = stepCard(
          '3 — Pourquoi pas d’appel ?',
          `
          <button type="button" class="loc-btn loc-btn-ghost" data-res="pas_de_numero">Pas de numéro</button>
          <button type="button" class="loc-btn loc-btn-ghost" data-res="autre_raison">Reporter</button>
          <button type="button" class="loc-btn loc-btn-ghost" id="coBack1b">Retour</button>
          `
        );
      } else if (step === 4) {
        body = stepCard(
          '4 — Suite',
          `
          <button type="button" class="loc-btn" data-after="resolu">Terminé / résolu</button>
          <button type="button" class="loc-btn loc-btn-ghost" data-after="reporte">À rappeler</button>
          <button type="button" class="loc-btn loc-btn-ghost" data-after="contacte">Marquer contacté</button>
          <button type="button" class="loc-btn loc-btn-ghost" id="coBack2">Retour</button>
          `,
          `<p class="loc-hint">Résultat : ${esc(draft.resultat || '')}</p>
           <label class="loc-field">Note finale<textarea id="coFinalNote" rows="2">${esc(draft.commentaire)}</textarea></label>`
        );
      }

      flowEl.innerHTML = header + body;

      flowEl.querySelector('#coNext1')?.addEventListener('click', () => {
        draft.commentaire = flowEl.querySelector('#coComment').value;
        step = 1;
        renderFlow();
      });
      flowEl.querySelector('#coBack0')?.addEventListener('click', () => { step = 0; renderFlow(); });
      flowEl.querySelector('#coBack1')?.addEventListener('click', () => { step = 1; renderFlow(); });
      flowEl.querySelector('#coBack1b')?.addEventListener('click', () => { step = 1; renderFlow(); });
      flowEl.querySelector('#coBack2')?.addEventListener('click', () => { step = 2; renderFlow(); });
      flowEl.querySelectorAll('[data-go]').forEach((b) => {
        b.addEventListener('click', () => {
          step = Number(b.dataset.go);
          renderFlow();
        });
      });
      flowEl.querySelectorAll('[data-res]').forEach((b) => {
        b.addEventListener('click', () => {
          draft.resultat = b.dataset.res;
          draft.canal = flowEl.querySelector('#coCanal')?.value || draft.canal;
          step = 4;
          renderFlow();
        });
      });
      flowEl.querySelectorAll('[data-after]').forEach((b) => {
        b.addEventListener('click', () => {
          draft.commentaire = flowEl.querySelector('#coFinalNote')?.value || draft.commentaire;
          finish(b.dataset.after);
        });
      });
    }

    async function finish(after) {
      if (!current) return;
      const statutMap = {
        resolu: 'resolu',
        reporte: 'reporte',
        contacte: 'contacte',
      };
      try {
        await LocationData.upsertContact({
          id: current.id,
          dossier_id: current.dossier_id,
          motif: current.motif,
          statut: statutMap[after] || 'contacte',
          commentaire: draft.commentaire,
          resultat: draft.resultat,
          canal: draft.canal,
          contacted_at: new Date().toISOString(),
        });
        showMsg('Contact enregistré.');
        current = null;
        step = 0;
        await refresh();
        flowEl.innerHTML = '<p class="loc-muted">Fiche suivante : sélectionnez dans la liste.</p>';
      } catch (e) {
        showMsg(e.message || 'Erreur', true);
      }
    }

    wrap.querySelector('#coSync').addEventListener('click', async () => {
      showMsg('Synchronisation…');
      try {
        const res = await LocationData.syncContactQueue(ctx.userId);
        showMsg(`${res.created.length} ajouté(s) · file ouverte ≈ ${res.totalOpen}`);
        await refresh();
      } catch (e) {
        showMsg(e.message || 'Sync impossible', true);
      }
    });

    wrap.querySelector('#coPrint').addEventListener('click', () => {
      LocationPrint.printContactList(items);
    });

    await refresh();
  }

  global.LocationContact = { mount };
})(window);
