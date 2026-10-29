/**
 * Helpers d’affichage partagés (parcours, leçons, jeux, mon espace) :
 * dates de mise à jour, barres / anneaux de progression, messages de verrouillage.
 *
 * Modèle de déblocage (voir sql/028) : chaque leçon / chapitre / parcours a des critères de validation
 * (lecture jusqu’en bas et / ou score minimum sur un jeu) ; l’élément suivant s’ouvre quand le précédent est validé.
 */
(function (global) {
  function esc(s) { return global.JpUi.escapeHtml(String(s == null ? '' : s)); }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /** « Mis à jour le 11 octobre 2026 » (vide si pas de date). */
  function majLabel(iso) {
    const s = fmtDate(iso);
    return s ? 'Mis à jour le ' + s : '';
  }

  function tone(pct) {
    if (pct == null) return 'none';
    return pct >= 75 ? 'good' : (pct >= 40 ? 'mid' : 'low');
  }

  function clampPct(p) {
    const n = Math.round(Number(p) || 0);
    return Math.max(0, Math.min(100, n));
  }

  /** 80 % -> « 8/10 » (échelle /10, comme les jeux) */
  function sur10(pct) {
    const v = Math.round((Number(pct) || 0)) / 10;
    return (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',')) + '/10';
  }

  function progressBar(pct, label) {
    const p = clampPct(pct);
    return '<div class="jp-pbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p
      + '"' + (label ? ' aria-label="' + esc(label) + '"' : '') + '><i class="is-' + tone(p) + '" style="width:' + p + '%"></i></div>';
  }

  /** Anneau SVG (progression / score). */
  function ring(pct, opts) {
    const o = opts || {};
    const p = clampPct(pct);
    const size = o.size || 72;
    return '<span class="jp-ring is-' + tone(p) + '" style="--jp-ring-size:' + size + 'px" role="img" aria-label="'
      + esc(o.label || (p + ' %')) + '">'
      + '<svg viewBox="0 0 36 36" aria-hidden="true">'
      + '<circle class="jp-ring-bg" cx="18" cy="18" r="15.9155"></circle>'
      + '<circle class="jp-ring-fg" cx="18" cy="18" r="15.9155" stroke-dasharray="' + p + ' 100" transform="rotate(-90 18 18)"></circle>'
      + '</svg><b>' + (o.text != null ? esc(o.text) : p + '<small>%</small>') + '</b></span>';
  }

  /* ——— Critères non remplis ——— */

  function jeuPart(j) {
    const min = sur10(j.score_min_pct);
    if (j.fait) {
      return 'refaire le jeu « ' + j.titre + ' » (minimum ' + min + ', votre meilleur score : ' + sur10(j.meilleur_pct) + ')';
    }
    return 'faire le jeu « ' + j.titre + ' » (minimum ' + min + ')';
  }

  /** { parts: string[], joiner: 'et' | 'ou' } — ce qu’il reste à faire pour valider (détail de v2_module_detail). */
  function restant(detail, titre) {
    if (!detail || detail.valide) return { parts: [], joiner: 'et' };
    const parts = [];
    if (detail.est_groupe) {
      parts.push('terminer toutes les leçons du chapitre « ' + (titre || '') + ' » (' + (detail.nb_valides || 0) + ' / ' + (detail.nb_lecons || 0) + ')');
    } else if (detail.lecture_requise && !detail.lu) {
      parts.push('lire la leçon « ' + (titre || '') + ' » jusqu’en bas');
    }
    (detail.lecons_lecture || []).filter((L) => !(L.ok || L.lu)).forEach((L) => {
      parts.push('lire la leçon « ' + (L.titre || '') + ' » jusqu’en bas');
    });
    (detail.jeux || []).filter((j) => !j.ok).forEach((j) => { parts.push(jeuPart(j)); });
    return { parts, joiner: detail.logique === 'ou' && !detail.est_groupe ? 'ou' : 'et' };
  }

  function join(parts, joiner) {
    if (parts.length <= 1) return parts[0] || '';
    return parts.slice(0, -1).join(', ') + ' ' + joiner + ' ' + parts[parts.length - 1];
  }

  /** Phrase courte « Terminez d’abord … » pour un élément bloquant (bloque_par d’un module ou d’un parcours). */
  function messageBloque(bp) {
    if (!bp) return '';
    if (bp.type === 'parcours') {
      let s = 'Terminez d’abord le parcours « ' + (bp.titre || '') + ' »';
      if (bp.pct != null) s += ' (' + clampPct(bp.pct) + ' %' + (bp.min_pct != null ? ' sur ' + clampPct(bp.min_pct) + ' % requis' : '') + ')';
      const jeux = (bp.jeux || []).filter((j) => !j.ok).map(jeuPart);
      return s + (jeux.length ? ', puis ' + join(jeux, 'et') : '') + '.';
    }
    const r = restant(bp.detail, bp.titre);
    if (!r.parts.length) return 'Terminez d’abord « ' + (bp.titre || '') + ' ».';
    return 'Pour débloquer : ' + join(r.parts, r.joiner) + '.';
  }

  /**
   * Message sous le bouton « Leçon suivante » quand elle est verrouillée.
   * Si le blocage vient de la leçon courante, on lui dit quoi faire (ex. « Veuillez faire le jeu … »).
   */
  function messageSuivante(bp, currentId, currentDetail, currentTitre) {
    if (!bp) return '';
    if (bp.type === 'module' && bp.module_id === currentId) {
      const r = restant(currentDetail || bp.detail, currentTitre);
      if (r.parts.length) {
        // « lire … » : le lecteur n’a qu’à aller en bas ; sinon formulation avec « Veuillez … »
        const parts = r.parts.map((p) => (/^lire /.test(p) ? 'lire la leçon jusqu’en bas' : p));
        return 'Veuillez ' + join(parts, r.joiner) + ' pour passer à la leçon suivante.';
      }
    }
    return messageBloque(bp);
  }

  /* ——— Arbre ——— */

  /** Feuilles (leçons) dans l’ordre de lecture : parcours en profondeur, `ordre` croissant. */
  function orderedLeaves(modules) {
    const ids = new Set((modules || []).map((m) => m.id));
    const byParent = {};
    (modules || []).forEach((m) => {
      const p = m.parent_id && ids.has(m.parent_id) ? m.parent_id : '';
      (byParent[p] = byParent[p] || []).push(m);
    });
    const out = [];
    function walk(pid) {
      (byParent[pid] || []).slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).forEach((m) => {
        if (m.est_groupe) walk(m.id);
        else out.push(m);
      });
    }
    walk('');
    return out;
  }

  /**
   * Leçon dont le bouton « suivante » mène à `currentId` (cible custom, précédent, ou ordre officiel).
   */
  function findRedirectSource(modules, currentId) {
    const list = modules || [];
    const leaves = orderedLeaves(list);
    const curIdx = leaves.findIndex((m) => m.id === currentId);
    // 1) Cible custom explicite
    const byCustom = list.find((m) => m.module_suivant_id === currentId
      && !m.module_suivant_precedent && !m.module_suivant_origine);
    if (byCustom) return byCustom;
    // 2) Mode « précédente » : la leçon dont la précédente officielle est current
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m.module_suivant_precedent) continue;
      const mi = leaves.findIndex((x) => x.id === m.id);
      if (mi > 0 && leaves[mi - 1].id === currentId) return m;
    }
    // 3) Ordre officiel : la feuille juste avant, sans override de suivant
    if (curIdx > 0) {
      const prev = leaves[curIdx - 1];
      if (prev && !prev.module_suivant_id && !prev.module_suivant_precedent && !prev.module_suivant_origine) {
        return prev;
      }
    }
    return null;
  }

  /**
   * Cible du bouton nav : origine > précédent > `module_suivant_id` > feuille suivante officielle.
   * @returns {{ idx: number, next: object|null, direction: 'next'|'prev', label: string|null }}
   */
  function resolveNext(modules, currentId) {
    const list = modules || [];
    const leaves = orderedLeaves(list);
    const idx = leaves.findIndex((m) => m.id === currentId);
    const cur = idx >= 0 ? leaves[idx] : list.find((m) => m.id === currentId) || null;
    if (!cur) return { idx: -1, next: null, direction: 'next', label: null };
    const customLabel = cur.module_suivant_libelle
      ? String(cur.module_suivant_libelle).trim() || null
      : null;

    if (cur.module_suivant_origine) {
      const src = findRedirectSource(list, currentId);
      return {
        idx,
        next: src,
        direction: 'prev',
        label: customLabel || (src ? src.titre : null),
      };
    }
    if (cur.module_suivant_precedent) {
      const prev = idx > 0 ? leaves[idx - 1] : null;
      return {
        idx,
        next: prev,
        direction: 'prev',
        label: customLabel || (prev ? prev.titre : null),
      };
    }
    if (cur.module_suivant_id) {
      const next = list.find((x) => x.id === cur.module_suivant_id) || null;
      const nextIdx = next ? leaves.findIndex((x) => x.id === next.id) : -1;
      const goPrev = nextIdx >= 0 && idx >= 0 && nextIdx < idx;
      return {
        idx,
        next,
        direction: goPrev ? 'prev' : 'next',
        label: customLabel || (next ? next.titre : null),
      };
    }
    const next = idx >= 0 ? (leaves[idx + 1] || null) : null;
    return {
      idx,
      next,
      direction: 'next',
      label: customLabel || null,
    };
  }

  global.JpParcoursUi = {
    fmtDate,
    majLabel,
    tone,
    clampPct,
    sur10,
    progressBar,
    ring,
    restant,
    messageBloque,
    messageSuivante,
    orderedLeaves,
    findRedirectSource,
    resolveNext,
  };
})(window);
