/**
 * Module Suivi — liste, édition, appareils, prolongations, tableau, impression.
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

  async function mount(root, ctx) {
    root.innerHTML = '';
    const wrap = el(`<div class="loc-module">
      <div class="loc-toolbar">
        <input type="search" id="suSearch" placeholder="Recherche nom / prénom">
        <select id="suStatut">
          <option value="">Tous statuts</option>
          <option value="actif" selected>Actifs</option>
          <option value="cloture">Clôturés</option>
          <option value="annule">Annulés</option>
        </select>
        <select id="suType">
          <option value="">Tous types</option>
          ${Object.entries(LocationRules.TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
        <label class="loc-check loc-check-inline"><input type="checkbox" id="suContact"> À contacter</label>
        <button type="button" class="loc-btn loc-btn-ghost" id="suRefresh">Actualiser</button>
        <button type="button" class="loc-btn loc-btn-ghost" id="suPrintTable">Imprimer tableau</button>
      </div>
      <div class="loc-split">
        <div class="loc-list" id="suList"></div>
        <div class="loc-detail" id="suDetail"><p class="loc-muted">Sélectionnez une fiche.</p></div>
      </div>
      <p class="loc-msg" id="suMsg" hidden></p>
    </div>`);
    root.appendChild(wrap);

    let rows = [];
    let selectedId = ctx.initialDossierId || null;
    const listEl = wrap.querySelector('#suList');
    const detailEl = wrap.querySelector('#suDetail');
    const msgEl = wrap.querySelector('#suMsg');

    function showMsg(t, err) {
      msgEl.hidden = !t;
      msgEl.textContent = t || '';
      msgEl.classList.toggle('loc-msg-err', !!err);
    }

    async function refresh() {
      showMsg('Chargement…');
      try {
        rows = await LocationData.listDossiers({
          q: wrap.querySelector('#suSearch').value,
          statut: wrap.querySelector('#suStatut').value || undefined,
          type_appareil: wrap.querySelector('#suType').value || undefined,
          a_contacter: wrap.querySelector('#suContact').checked || undefined,
        });
        showMsg('');
        renderList();
        if (selectedId) {
          const still = rows.find((r) => r.id === selectedId);
          if (still) await openDetail(selectedId);
          else {
            selectedId = null;
            detailEl.innerHTML = '<p class="loc-muted">Sélectionnez une fiche.</p>';
          }
        }
      } catch (e) {
        showMsg(e.message || 'Erreur chargement', true);
      }
    }

    function renderList() {
      if (!rows.length) {
        listEl.innerHTML = '<p class="loc-muted">Aucune fiche.</p>';
        return;
      }
      listEl.innerHTML = rows
        .map((d) => {
          const p = d.patient || {};
          const a = d.appareil_actif || {};
          return `<button type="button" class="loc-list-item${d.id === selectedId ? ' active' : ''}" data-id="${d.id}">
            <strong>${esc(p.nom)} ${esc(p.prenom)}</strong>
            <span>${esc(LocationRules.typeLabel(a.type_appareil))} · fin ${esc(d.date_fin || '—')}</span>
            <span class="loc-badge">${esc(d.statut)}</span>
          </button>`;
        })
        .join('');
      listEl.querySelectorAll('[data-id]').forEach((b) => {
        b.addEventListener('click', () => openDetail(b.dataset.id));
      });
    }

    async function openDetail(id) {
      selectedId = id;
      renderList();
      detailEl.innerHTML = '<p class="loc-muted">Chargement…</p>';
      try {
        const d = await LocationData.getDossier(id);
        renderDetail(d);
      } catch (e) {
        detailEl.innerHTML = `<p class="loc-msg-err">${esc(e.message)}</p>`;
      }
    }

    function renderDetail(d) {
      const p = d.patient || {};
      const a = d.appareil_actif || {};
      const canDelete = ctx.isAdmin || ctx.isGestionnaire;
      const prest = a.source === 'prestataire';
      const parc = !prest;

      detailEl.innerHTML = `
        <div class="loc-detail-head">
          <h3>${esc(p.nom)} ${esc(p.prenom)}</h3>
          <div class="loc-detail-actions">
            <button type="button" class="loc-btn loc-btn-ghost" id="suPrint">Imprimer fiche</button>
            <button type="button" class="loc-btn" id="suSave">Enregistrer</button>
            ${canDelete ? '<button type="button" class="loc-btn loc-btn-ghost" id="suDelete">Supprimer</button>' : ''}
          </div>
        </div>

        <details open class="loc-card">
          <summary>Patient</summary>
          <div class="loc-grid-2">
            <label class="loc-field">Nom<input name="p_nom" value="${esc(p.nom)}"></label>
            <label class="loc-field">Prénom<input name="p_prenom" value="${esc(p.prenom)}"></label>
            <label class="loc-field">Naissance<input type="date" name="p_dn" value="${esc(p.date_naissance || '')}"></label>
            <label class="loc-field loc-span-2">Adresse<textarea name="p_adresse" rows="2">${esc(p.adresse || '')}</textarea></label>
          </div>
          <div class="loc-grid-2" style="margin-top:10px">
            <div class="loc-span-2">${LocationFields.blockHtml('phones', 'Téléphones')}</div>
            <div class="loc-span-2">${LocationFields.blockHtml('mails', 'Mails')}</div>
          </div>
        </details>

        <details open class="loc-card">
          <summary>Dossier</summary>
          <div class="loc-grid-2">
            <label class="loc-field">Code OP<input name="code_op" value="${esc(d.code_op || '')}"></label>
            <label class="loc-field">Caution<select name="caution">
              <option value=""${!d.caution ? ' selected' : ''}>Rien</option>
              <option value="cheque_150"${d.caution === 'cheque_150' ? ' selected' : ''}>Chèque 150 €</option>
              <option value="especes"${d.caution === 'especes' ? ' selected' : ''}>Espèces</option>
            </select></label>
            <label class="loc-field">Statut<select name="statut">
              <option value="actif"${d.statut === 'actif' ? ' selected' : ''}>Actif</option>
              <option value="cloture"${d.statut === 'cloture' ? ' selected' : ''}>Clôturé</option>
              <option value="annule"${d.statut === 'annule' ? ' selected' : ''}>Annulé</option>
            </select></label>
            <label class="loc-field">Qui facture<select name="qui_facture">
              <option value="pharmacie"${d.qui_facture === 'pharmacie' ? ' selected' : ''}>Pharmacie</option>
              <option value="prestataire"${d.qui_facture === 'prestataire' ? ' selected' : ''}>Prestataire</option>
            </select></label>
            <label class="loc-field">Date début<input type="date" name="date_debut" value="${esc(d.date_debut || '')}"></label>
            <label class="loc-field">Fin courante<input type="text" value="${esc(d.date_fin || '')}" disabled></label>
            <label class="loc-check"><input type="checkbox" name="appareil_rendu"${d.appareil_rendu ? ' checked' : ''}> Appareil rendu</label>
            <label class="loc-check"><input type="checkbox" name="caution_rendue"${d.caution_rendue ? ' checked' : ''}> Caution rendue</label>
            <label class="loc-field">Caution rendue le<input type="date" name="caution_rendue_le" value="${esc(d.caution_rendue_le || '')}"></label>
            <label class="loc-field">OP caution<input name="caution_rendue_op" value="${esc(d.caution_rendue_op || '')}"></label>
            <label class="loc-field">Date clôture<input type="date" name="date_cloture" value="${esc(d.date_cloture || '')}"></label>
            <label class="loc-field">OP clôture<input name="cloture_op" value="${esc(d.cloture_op || '')}"></label>
            <label class="loc-field loc-span-2">Notes<textarea name="notes" rows="2">${esc(d.notes || '')}</textarea></label>
          </div>
        </details>

        <details open class="loc-card">
          <summary>Appareil actif · historique</summary>
          <div class="loc-appareil-actif loc-grid-2">
            <label class="loc-field">Type<input value="${esc(LocationRules.typeLabel(a.type_appareil))}${a.type_libelle ? ' (' + esc(a.type_libelle) + ')' : ''}" disabled></label>
            <label class="loc-field">Source<select name="a_source">
              <option value="parc"${parc ? ' selected' : ''}>Parc pharmacie</option>
              <option value="prestataire"${prest ? ' selected' : ''}>Prestataire</option>
            </select></label>
            <label class="loc-field">Matricule<input name="a_matricule" value="${esc(a.matricule || '')}"></label>
            <label class="loc-field">N° pharmacie<input name="a_numero" value="${esc(a.numero_pharmacie || '')}"></label>
            <label class="loc-field">Obtention<select name="a_obtention">
              <option value="">—</option>
              <option value="depot"${a.mode_obtention === 'depot' ? ' selected' : ''}>Dépôt</option>
              <option value="appel"${a.mode_obtention === 'appel' ? ' selected' : ''}>Appel</option>
            </select></label>
            <label class="loc-field">Livraison<select name="a_livraison">
              <option value="">—</option>
              <option value="pharmacie"${a.livraison === 'pharmacie' ? ' selected' : ''}>Pharmacie</option>
              <option value="patient"${a.livraison === 'patient' ? ' selected' : ''}>Patient</option>
            </select></label>
            <label class="loc-check"><input type="checkbox" name="a_desinfection"${a.desinfection ? ' checked' : ''}> Désinfection faite</label>
            <label class="loc-check"><input type="checkbox" name="facturation_prestataire"${a.facturation_prestataire ? ' checked' : ''}> Facturation prestataire (hors file contact)</label>
            ${a.type_appareil === 'pese_bebe' ? `
              <label class="loc-check"><input type="checkbox" name="a_pese_avance"${a.pese_bebe_regler_avance ? ' checked' : ''}> Régler d’avance</label>
              <label class="loc-field">Période<select name="a_pese_periode">
                <option value="semaine"${a.pese_bebe_periode === 'semaine' ? ' selected' : ''}>Semaine</option>
                <option value="mois"${a.pese_bebe_periode === 'mois' ? ' selected' : ''}>Mois</option>
              </select></label>
            ` : ''}
            ${a.type_appareil === 'tire_lait' ? `
              <label class="loc-field">Date accouchement<input type="date" name="a_accouchement" value="${esc(a.date_accouchement || '')}"></label>
            ` : ''}
            <label class="loc-field loc-span-2">Encart<textarea name="encart_texte" rows="3">${esc(a.encart_texte || '')}</textarea></label>
          </div>
          <h4>Historique</h4>
          <ul class="loc-history">
            ${(d.appareils || []).map((x) => `<li>${esc(LocationRules.typeLabel(x.type_appareil))} · ${x.source || ''} · ${x.actif ? 'actif' : 'inactif'} · n° ${esc(x.numero_pharmacie || x.matricule || '—')} · ${esc(x.date_debut || '')} → ${esc(x.date_fin || '…')}</li>`).join('') || '<li>Aucun</li>'}
          </ul>
          <button type="button" class="loc-btn loc-btn-ghost" id="suNewApp">Changer d’appareil</button>
          <div id="suNewAppForm" hidden></div>
        </details>

        <details open class="loc-card">
          <summary>Prolongations</summary>
          <ul class="loc-history">
            ${(d.prolongations || []).map((pr) =>
              `<li>${esc(pr.date_ordo || '')} · ${pr.duree} ${esc(pr.unite)} → fin ${esc(pr.date_fin || '')}${pr.notes ? ' · ' + esc(pr.notes) : ''}</li>`
            ).join('') || '<li>Aucune</li>'}
          </ul>
          <div class="loc-grid-2" id="suProlongForm">
            <label class="loc-field">Date ordo<input type="date" name="pr_ordo" value="${LocationRules.todayISO()}"></label>
            <label class="loc-field">Durée<input type="number" min="1" name="pr_duree" value="1"></label>
            <label class="loc-field">Unité<select name="pr_unite">
              <option value="jours">Jours</option>
              <option value="semaines" selected>Semaines</option>
              <option value="mois">Mois</option>
            </select></label>
            <label class="loc-field">Notes<input name="pr_notes"></label>
          </div>
          <button type="button" class="loc-btn loc-btn-ghost" id="suAddProlong">Ajouter prolongation</button>
        </details>

        <details open class="loc-card">
          <summary>Tableau de suivi (éditable)</summary>
          <div class="loc-table-wrap">
            <table class="loc-table" id="suSuiviTable">
              <thead><tr><th>Date</th><th>Libellé</th><th>Détails</th><th></th></tr></thead>
              <tbody>
                ${(d.suivi || []).map((s) => `
                  <tr data-id="${s.id}">
                    <td><input type="date" value="${esc(s.date_ligne || '')}" data-f="date_ligne"></td>
                    <td><input value="${esc(s.libelle || '')}" data-f="libelle"></td>
                    <td><input value="${esc(s.details || '')}" data-f="details"></td>
                    <td><button type="button" class="loc-icon-btn" data-del="${s.id}" title="Supprimer">✕</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <button type="button" class="loc-btn loc-btn-ghost" id="suAddLigne">Ajouter une ligne</button>
        </details>
      `;

      LocationFields.mountPhones(
        detailEl.querySelector('#phonesList'),
        detailEl.querySelector('#addPhoneBtn'),
        p.telephones || []
      );
      LocationFields.mountMails(
        detailEl.querySelector('#mailsList'),
        detailEl.querySelector('#addMailBtn'),
        p.mails || []
      );

      detailEl.querySelector('#suPrint').addEventListener('click', () => {
        // d déjà chargé via getDossier dans openDetail — print synchrone (geste utilisateur)
        LocationPrint.printFiche(d);
      });
      detailEl.querySelector('#suSave').addEventListener('click', () => saveDetail(d));
      detailEl.querySelector('#suAddProlong').addEventListener('click', () => addProlong(d));
      detailEl.querySelector('#suAddLigne').addEventListener('click', () => addLigne(d));
      detailEl.querySelector('#suDelete')?.addEventListener('click', () => deleteFiche(d));
      detailEl.querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!canDelete) {
            showMsg('Suppression réservée aux gestionnaires / administrateurs.', true);
            return;
          }
          try {
            await LocationData.deleteSuiviLigne(b.dataset.del);
            openDetail(d.id);
          } catch (e) {
            showMsg(e.message, true);
          }
        });
      });
      detailEl.querySelector('#suNewApp').addEventListener('click', () => showNewAppForm(d));
    }

    async function deleteFiche(d) {
      const canDelete = ctx.isAdmin || ctx.isGestionnaire;
      if (!canDelete) {
        showMsg('Suppression réservée aux gestionnaires / administrateurs.', true);
        return;
      }
      const p = d.patient || {};
      const label = `${p.nom || ''} ${p.prenom || ''}`.trim() || 'cette fiche';
      if (!window.confirm(`Supprimer définitivement la fiche de ${label} ?`)) return;
      try {
        await LocationData.deleteDossier(d.id);
        selectedId = null;
        detailEl.innerHTML = '<p class="loc-muted">Sélectionnez une fiche.</p>';
        await refresh();
        showMsg('Fiche supprimée.');
      } catch (e) {
        showMsg(e.message || 'Erreur suppression', true);
      }
    }

    function showNewAppForm(d) {
      const box = detailEl.querySelector('#suNewAppForm');
      box.hidden = false;
      box.innerHTML = `
        <div class="loc-grid-2" style="margin-top:8px">
          <label class="loc-field">Type<select name="na_type">
            ${Object.entries(LocationRules.TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select></label>
          <label class="loc-field">Matricule<input name="na_mat"></label>
          <label class="loc-field">N° pharmacie<input name="na_num"></label>
          <label class="loc-field">Source<select name="na_src"><option value="parc">Parc</option><option value="prestataire">Prestataire</option></select></label>
          <label class="loc-field loc-span-2">Encart<textarea name="na_enc" rows="2"></textarea></label>
        </div>
        <button type="button" class="loc-btn" id="suConfirmApp">Confirmer le changement</button>
      `;
      const typeSel = box.querySelector('[name=na_type]');
      const enc = box.querySelector('[name=na_enc]');
      enc.value = LocationRules.encartDefaut(typeSel.value);
      typeSel.addEventListener('change', () => { enc.value = LocationRules.encartDefaut(typeSel.value); });
      box.querySelector('#suConfirmApp').addEventListener('click', async () => {
        try {
          await LocationData.changerAppareil(d.id, {
            type_appareil: typeSel.value,
            matricule: box.querySelector('[name=na_mat]').value.trim() || null,
            numero_pharmacie: box.querySelector('[name=na_num]').value.trim() || null,
            source: box.querySelector('[name=na_src]').value,
            encart_texte: enc.value,
          });
          showMsg('Appareil changé.');
          openDetail(d.id);
        } catch (e) {
          showMsg(e.message, true);
        }
      });
    }

    async function saveDetail(d) {
      const g = (n) => detailEl.querySelector(`[name=${n}]`);
      try {
        await LocationData.updatePatient(d.patient.id, {
          nom: g('p_nom').value.trim(),
          prenom: g('p_prenom').value.trim(),
          date_naissance: g('p_dn').value || null,
          adresse: g('p_adresse').value.trim() || null,
          telephones: LocationFields.collectPhones(detailEl.querySelector('#phonesList')),
          mails: LocationFields.collectMails(detailEl.querySelector('#mailsList')),
        });
        const statut = g('statut').value;
        const cautionVal = g('caution').value;
        await LocationData.updateDossier(d.id, {
          code_op: g('code_op').value.trim() || null,
          caution: cautionVal || null,
          statut,
          qui_facture: g('qui_facture').value,
          date_debut: g('date_debut').value || null,
          appareil_rendu: g('appareil_rendu').checked,
          caution_rendue: g('caution_rendue').checked,
          caution_rendue_le: g('caution_rendue_le').value || null,
          caution_rendue_op: g('caution_rendue_op').value.trim() || null,
          date_cloture: g('date_cloture').value || (statut === 'cloture' ? LocationRules.todayISO() : null),
          cloture_op: g('cloture_op').value.trim() || null,
          notes: g('notes').value.trim() || null,
        });
        if (d.appareil_actif) {
          const appPatch = {
            source: g('a_source').value,
            matricule: g('a_matricule').value.trim() || null,
            numero_pharmacie: g('a_numero').value.trim() || null,
            mode_obtention: g('a_obtention').value || null,
            livraison: g('a_livraison').value || null,
            desinfection: !!g('a_desinfection')?.checked,
            encart_texte: g('encart_texte').value,
            facturation_prestataire: g('facturation_prestataire').checked,
          };
          if (g('a_pese_avance')) {
            appPatch.pese_bebe_regler_avance = g('a_pese_avance').checked;
            appPatch.pese_bebe_periode = g('a_pese_periode')?.value || null;
          }
          if (g('a_accouchement')) {
            appPatch.date_accouchement = g('a_accouchement').value || null;
          }
          await LocationData.updateAppareil(d.appareil_actif.id, appPatch);
        }
        const trs = detailEl.querySelectorAll('#suSuiviTable tbody tr[data-id]');
        for (const tr of trs) {
          await LocationData.upsertSuiviLigne({
            id: tr.dataset.id,
            dossier_id: d.id,
            date_ligne: tr.querySelector('[data-f=date_ligne]').value || null,
            libelle: tr.querySelector('[data-f=libelle]').value.trim() || null,
            details: tr.querySelector('[data-f=details]').value.trim() || null,
          });
        }
        showMsg('Enregistré.');
        await refresh();
        await openDetail(d.id);
      } catch (e) {
        showMsg(e.message || 'Erreur enregistrement', true);
      }
    }

    async function addProlong(d) {
      const box = detailEl.querySelector('#suProlongForm');
      const duree = Number(box.querySelector('[name=pr_duree]').value);
      const unite = box.querySelector('[name=pr_unite]').value;
      const rules = await LocationData.loadRules();
      const evalRes = LocationRules.evaluate(
        { ...LocationData.dossierContext(d), prolong_duree: duree, prolong_unite: unite },
        rules,
        await LocationData.loadParams()
      );
      const block = evalRes.alerts.find((a) => a.action === 'bloquer_ou_alerter');
      if (block && !confirm(block.message + '\n\nContinuer quand même ?')) return;
      try {
        await LocationData.addProlongation(
          d.id,
          {
            date_ordo: box.querySelector('[name=pr_ordo]').value || null,
            duree,
            unite,
            notes: box.querySelector('[name=pr_notes]').value.trim() || null,
          },
          ctx.userId
        );
        showMsg('Prolongation ajoutée.');
        openDetail(d.id);
      } catch (e) {
        showMsg(e.message, true);
      }
    }

    async function addLigne(d) {
      try {
        await LocationData.upsertSuiviLigne({
          dossier_id: d.id,
          appareil_id: d.appareil_actif?.id || null,
          date_ligne: LocationRules.todayISO(),
          libelle: '',
          details: '',
          created_by: ctx.userId || null,
        });
        openDetail(d.id);
      } catch (e) {
        showMsg(e.message, true);
      }
    }

    wrap.querySelector('#suRefresh').addEventListener('click', refresh);
    wrap.querySelector('#suSearch').addEventListener('change', refresh);
    wrap.querySelector('#suStatut').addEventListener('change', refresh);
    wrap.querySelector('#suType').addEventListener('change', refresh);
    wrap.querySelector('#suContact').addEventListener('change', refresh);
    wrap.querySelector('#suPrintTable').addEventListener('click', () => LocationPrint.printTableau(rows));

    await refresh();
    if (selectedId) await openDetail(selectedId);
  }

  global.LocationSuivi = { mount };
})(window);
