// --- CONFIGURATION ---
const cfg = window.SUPABASE_CONFIG;
if (!cfg?.url || !cfg?.anonKey) throw new Error('SUPABASE_CONFIG manquant');

const sbAuth = supabase.createClient(cfg.url, cfg.anonKey, { db: { schema: 'portail' } });
const sbVaccin = supabase.createClient(cfg.url, cfg.anonKey, { db: { schema: 'autres' } });
const TABLE_NAME = 'vaccins';

const FAMILIES = [
  { id: '', label: 'Toutes' },
  { id: 'dtp', label: 'DTP / Hib / Hexa' },
  { id: 'hep', label: 'Hépatites' },
  { id: 'men', label: 'Méningocoques' },
  { id: 'pneumo', label: 'Pneumocoque' },
  { id: 'ror', label: 'ROR / Varicelle / Zona' },
  { id: 'saison', label: 'Grippe / Covid / VRS' },
  { id: 'voyage', label: 'Voyage / tropicaux' },
  { id: 'autre', label: 'Autres' }
];

const DEFAULT_SITUATIONS =
  "Obligatoire : Vaccination obligatoire\n" +
  "Immunodéprimé : Patients immunodéprimés\n" +
  "VIH : Personnes vivant avec le VIH\n" +
  "Grossesse : Femmes enceintes\n" +
  "Voyage : Voyageurs / zones d'endémie\n" +
  "Professionnel : Exposition professionnelle\n" +
  "Cocooning : Entourage du nourrisson\n" +
  "Senior : 65 ans et plus";

const DEFAULT_LEGEND =
  "Années révolues = années terminées (ex. 24 ans révolus = jusqu'à la veille du 25e anniversaire). " +
  "Sources : Calendrier vaccinal 2026 + Vaccination Info Service. " +
  "Revaxis (dTP) arrêté → rappels adultes en dTcaP. " +
  "NeisVac arrêté ; Menjugate / Pentavac / HBVaxPro 10 µg : voir fiches concernées.";

// --- ETAT ---
let currentData = [];
let filteredData = [];
let settingsId = null;
let isAdmin = false;
let sortCol = 'pathologie';
let sortAsc = true;
let activeFamily = '';

const quillDetails = new Quill('#f_details', { theme: 'snow' });
const quillRattrapage = new Quill('#f_rattrapage', { theme: 'snow' });
const el = id => document.getElementById(id);

// --- UTILITAIRES ---
function showMessage(msg, isError = false) {
  const container = el('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : 'success'}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripHTML(html) {
  return (html || '').replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
}

function getFallbackColor(patho) {
  if (!patho) return '#7F8C8D';
  const p = patho.toLowerCase();
  if (p.includes('bcg') || p.includes('tuberculose')) return '#8E44AD';
  if (p.includes('diphtérie') || p.includes('tétanos') || p.includes('coqueluche') || p.includes('poliomyélite') || p.includes('haemophilus')) return '#16A085';
  if (p.includes('hépatite')) return '#F39C12';
  if (p.includes('méningocoque') || p.includes('rougeole') || p.includes('pneumocoque') || p.includes('oreillons')) return '#E83A5D';
  if (p.includes('papillomavirus') || p.includes('hpv')) return '#E67E22';
  if (p.includes('varicelle') || p.includes('zona')) return '#9B59B6';
  if (p.includes('grippe') || p.includes('leptospirose')) return '#3498DB';
  if (p.includes('rage')) return '#F1C40F';
  if (p.includes('choléra') || p.includes('dengue') || p.includes('chikungunya') || p.includes('fièvre jaune') || p.includes('typhoïde') || p.includes('encéphalite')) return '#2980B9';
  if (p.includes('rotavirus') || p.includes('covid') || p.includes('mpox') || p.includes('vrs') || p.includes('syncytial')) return '#607D8B';
  return '#7F8C8D';
}

function getFamily(patho) {
  const p = (patho || '').toLowerCase();
  if (/diphtérie|tétanos|coqueluche|poliomyélite|haemophilus/.test(p)) return 'dtp';
  if (/hépatite/.test(p)) return 'hep';
  if (/méningocoque/.test(p)) return 'men';
  if (/pneumocoque/.test(p)) return 'pneumo';
  if (/rougeole|oreillons|rubéole|varicelle|zona/.test(p)) return 'ror';
  if (/grippe|covid|vrs|syncytial/.test(p)) return 'saison';
  if (/fièvre jaune|dengue|chikungunya|typhoïde|choléra|encéphalite|rage|leptospirose/.test(p)) return 'voyage';
  return 'autre';
}

function getBadges(v) {
  const t = `${v.pathologie} ${v.vaccins} ${v.calendrier} ${stripHTML(v.details)} ${stripHTML(v.rattrapage)}`.toLowerCase();
  const badges = [];
  if (/\bobligatoire\b/.test(t)) badges.push({ k: 'obl', l: 'Obligatoire' });
  if (/grossesse|aménorrhée|\bsa\b|enceinte|post[- ]?partum/.test(t)) badges.push({ k: 'gross', l: 'Grossesse' });
  if (/65 ans|75 ans|senior/.test(t)) badges.push({ k: 'senior', l: 'Senior' });
  if (/voyage|endémie|départ imminent|zones d.?endémie/.test(t)) badges.push({ k: 'voyage', l: 'Voyage' });
  if (/professionnel|médecine du travail|l\.3111|pros\b|personnel/.test(t)) badges.push({ k: 'pro', l: 'Pro' });
  if (/cocooning|entourage du (nouveau-né|nourrisson)/.test(t)) badges.push({ k: 'coco', l: 'Cocooning' });
  if (/\bvih\b/.test(t)) badges.push({ k: 'vih', l: 'VIH' });
  if (/immunodéprim/.test(t)) badges.push({ k: 'immuno', l: 'Immuno' });
  if (/arrêt|arrêté|n.est plus commercialisé|plus utilisé en recommandation|remplacé par/.test(t)) {
    badges.push({ k: 'stop', l: 'Transition' });
  }
  return badges;
}

function renderBadges(badges) {
  if (!badges.length) return '';
  return `<div class="row-badges">${badges.map(b => `<span class="badge ${b.k}">${escapeHtml(b.l)}</span>`).join('')}</div>`;
}

function highlight(text, query) {
  const safeText = escapeHtml(text);
  if (!query) return safeText;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return safeText.replace(regex, '<mark>$1</mark>');
}

// --- INIT ---
async function init() {
  try {
    const { data: { session } } = await sbAuth.auth.getSession();
    if (session) {
      const { data: profile } = await sbAuth.from('profiles').select('role').eq('id', session.user.id).single();
      if (profile && profile.role === 'admin') {
        isAdmin = true;
        el('toggleAdminBtn').classList.remove('hidden');
      }
    }
  } catch (_) { /* accès lecture publique possible */ }

  renderFamilyChips();
  setupEventListeners();
  await loadData();
}

function renderFamilyChips() {
  const host = el('familyChips');
  host.innerHTML = FAMILIES.map(f =>
    `<button type="button" class="chip${f.id === activeFamily ? ' active' : ''}" data-family="${f.id}">${escapeHtml(f.label)}</button>`
  ).join('');
}

function setupEventListeners() {
  el('toggleAdminBtn').addEventListener('click', () => {
    el('adminPanel').classList.toggle('active');
    document.body.classList.toggle('admin-active');
  });

  el('printBtn').addEventListener('click', () => window.print());
  el('searchInput').addEventListener('input', onSearchInput);
  el('clearSearchBtn').addEventListener('click', () => {
    el('searchInput').value = '';
    el('clearSearchBtn').classList.add('hidden');
    filterTable();
    el('searchInput').focus();
  });
  el('filterParticularity').addEventListener('change', filterTable);
  el('saveSettingsBtn').addEventListener('click', saveSettings);
  el('importFile').addEventListener('change', importData);
  el('exportBtn').addEventListener('click', exportData);
  el('cancelEditBtn').addEventListener('click', resetForm);
  el('addForm').addEventListener('submit', saveEntry);

  el('familyChips').addEventListener('click', e => {
    const btn = e.target.closest('[data-family]');
    if (!btn) return;
    activeFamily = btn.getAttribute('data-family') || '';
    renderFamilyChips();
    filterTable();
  });

  el('vaccineTbody').addEventListener('click', e => {
    const adminEdit = e.target.closest('[data-edit]');
    const adminDel = e.target.closest('[data-delete]');
    const link = e.target.closest('a');
    if (link) return;
    if (adminEdit) {
      e.stopPropagation();
      editEntry(adminEdit.getAttribute('data-edit'));
      return;
    }
    if (adminDel) {
      e.stopPropagation();
      deleteEntry(adminDel.getAttribute('data-delete'));
      return;
    }
    const row = e.target.closest('tr[data-id]');
    if (row) openModal(row.getAttribute('data-id'));
  });

  el('vaccineTbody').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('tr[data-id]');
    if (!row) return;
    e.preventDefault();
    openModal(row.getAttribute('data-id'));
  });

  el('vaccinModal').addEventListener('click', e => {
    if (e.target === el('vaccinModal')) closeModal();
  });
  el('closeModalBtn').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && el('vaccinModal').classList.contains('active')) closeModal();
  });

  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-col');
      if (sortCol === col) sortAsc = !sortAsc;
      else { sortCol = col; sortAsc = true; }
      document.querySelectorAll('th.sortable').forEach(h => h.classList.remove('asc', 'desc'));
      th.classList.add(sortAsc ? 'asc' : 'desc');
      applySortAndRender();
    });
  });
}

function onSearchInput() {
  const has = el('searchInput').value.trim().length > 0;
  el('clearSearchBtn').classList.toggle('hidden', !has);
  filterTable();
}

// --- DATA ---
async function loadData() {
  const { data, error } = await sbVaccin.from(TABLE_NAME).select('*');
  if (error) {
    el('vaccineTbody').innerHTML = `<tr><td colspan="3" class="empty-cell">Erreur : ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  const settingsEntry = data.find(item => item.pathologie === '__PARAMETRES__');

  if (settingsEntry) {
    settingsId = settingsEntry.id;
    el('adminDateInput').value = settingsEntry.calendrier || '';
    el('adminLegendInput').value = settingsEntry.rattrapage || DEFAULT_LEGEND;
    el('adminSituationsInput').value = settingsEntry.details || DEFAULT_SITUATIONS;
    el('legendText').textContent = settingsEntry.rattrapage || DEFAULT_LEGEND;

    if (settingsEntry.calendrier) {
      const dateObj = new Date(settingsEntry.calendrier);
      el('lastUpdated').textContent =
        'Calendrier vaccinal 2026 · mise à jour affichée : ' +
        dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    } else {
      autoCalculateDate(data);
    }
    updateFilterSelect(settingsEntry.details || DEFAULT_SITUATIONS);
  } else {
    settingsId = null;
    el('adminLegendInput').value = DEFAULT_LEGEND;
    el('adminSituationsInput').value = DEFAULT_SITUATIONS;
    el('legendText').textContent = DEFAULT_LEGEND;
    updateFilterSelect(DEFAULT_SITUATIONS);
    autoCalculateDate(data);
  }

  currentData = data.filter(item => item.pathologie !== '__PARAMETRES__') || [];
  filterTable();
}

function autoCalculateDate(dataArr) {
  const regularData = dataArr.filter(item => item.pathologie !== '__PARAMETRES__');
  if (regularData.length > 0) {
    const dates = regularData.map(v => new Date(v.created_at || Date.now()));
    const maxDate = new Date(Math.max.apply(null, dates));
    el('lastUpdated').textContent =
      'Dernière mise à jour : ' +
      maxDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } else {
    el('lastUpdated').textContent = 'Aucune donnée';
  }
}

function updateFilterSelect(situationsText) {
  const select = el('filterParticularity');
  select.innerHTML = '<option value="">Toutes les situations</option>';
  if (!situationsText) return;

  situationsText.split('\n').forEach(line => {
    if (!line.trim()) return;
    const parts = line.split(':');
    const val = parts[0].trim();
    const label = parts.length > 1 ? parts.slice(1).join(':').trim() : val;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    select.appendChild(opt);
  });
}

// --- FILTER / SORT ---
function filterTable() {
  const query = el('searchInput').value.toLowerCase().trim();
  const particularity = el('filterParticularity').value.toLowerCase();

  filteredData = currentData.filter(v => {
    if (activeFamily && getFamily(v.pathologie) !== activeFamily) return false;

    const txtPatho = (v.pathologie || '').toLowerCase();
    const txtVaccins = (v.vaccins || '').toLowerCase();
    const txtCal = (v.calendrier || '').toLowerCase();
    const plainDetails = stripHTML(v.details).toLowerCase();
    const plainRattrapage = stripHTML(v.rattrapage).toLowerCase();
    const haystack = `${txtPatho} ${txtVaccins} ${txtCal} ${plainDetails} ${plainRattrapage}`;

    const matchSearch = !query || haystack.includes(query);
    const matchFilter = !particularity || haystack.includes(particularity);
    return matchSearch && matchFilter;
  });

  applySortAndRender();
}

function applySortAndRender() {
  filteredData.sort((a, b) => {
    const valA = (a[sortCol] || '').toLowerCase();
    const valB = (b[sortCol] || '').toLowerCase();
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });
  renderTable(filteredData);
}

function renderTable(dataArray) {
  const tbody = el('vaccineTbody');
  const query = el('searchInput').value.trim();
  const total = currentData.length;

  el('resultCount').textContent =
    dataArray.length === total
      ? `${total} fiches`
      : `${dataArray.length} / ${total} fiches`;

  if (dataArray.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">Aucun vaccin ne correspond à votre recherche.</td></tr>';
    return;
  }

  tbody.innerHTML = dataArray.map(v => {
    const color = v.couleur || getFallbackColor(v.pathologie);
    const badges = getBadges(v);
    return `<tr data-id="${escapeHtml(v.id)}" tabindex="0" role="button" aria-label="Ouvrir ${escapeHtml(v.pathologie)}">
      <td class="col-patho" style="background-color:${color};">
        ${highlight(v.pathologie, query)}
        ${renderBadges(badges)}
      </td>
      <td class="col-vaccin">${highlight(v.vaccins, query)}</td>
      <td class="col-cal">
        ${highlight(v.calendrier, query)}
        <span class="hint-click no-print">Cliquer pour schéma &amp; rattrapage</span>
        <div class="row-actions no-print">
          ${v.lien ? `<a href="${escapeHtml(v.lien)}" target="_blank" rel="noopener" class="btn ghost" onclick="event.stopPropagation();">Fiche VIS</a>` : ''}
          ${isAdmin ? `
            <span class="inline-admin-btns">
              <button type="button" class="btn admin-btn" data-edit="${escapeHtml(v.id)}">Éditer</button>
              <button type="button" class="btn danger-btn" data-delete="${escapeHtml(v.id)}">Supprimer</button>
            </span>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// --- MODAL ---
function openModal(id) {
  const v = currentData.find(item => item.id == id);
  if (!v) return;

  const color = v.couleur || getFallbackColor(v.pathologie);
  el('modalPathologieTag').textContent = v.pathologie;
  el('modalPathologieTag').style.backgroundColor = color;
  el('modalNom').textContent = v.vaccins;
  el('modalCalendrier').textContent = v.calendrier || 'Schéma non renseigné';
  el('modalBadges').innerHTML = renderBadges(getBadges(v));
  el('modalDetails').innerHTML = v.details || '<p>Aucune information.</p>';
  el('modalRattrapage').innerHTML = v.rattrapage || '<p>Non spécifié.</p>';
  el('modalFooter').innerHTML = v.lien
    ? `<a href="${escapeHtml(v.lien)}" target="_blank" rel="noopener" class="btn link-btn">Ouvrir la fiche Vaccination Info Service</a>`
    : '';

  el('vaccinModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  el('vaccinModal').classList.remove('active');
  document.body.style.overflow = '';
}

// --- ADMIN ---
async function saveEntry(e) {
  e.preventDefault();
  const id = el('editId').value;
  const payload = {
    pathologie: el('f_pathologie').value,
    vaccins: el('f_vaccins').value,
    calendrier: el('f_calendrier').value,
    lien: el('f_lien').value,
    couleur: el('f_couleur').value,
    details: quillDetails.root.innerHTML,
    rattrapage: quillRattrapage.root.innerHTML
  };

  el('saveBtn').textContent = '…';
  const res = id
    ? await sbVaccin.from(TABLE_NAME).update(payload).eq('id', id)
    : await sbVaccin.from(TABLE_NAME).insert([payload]);
  el('saveBtn').textContent = 'Enregistrer';

  if (res.error) showMessage(res.error.message, true);
  else {
    showMessage('Vaccin enregistré !');
    resetForm();
    await loadData();
  }
}

function editEntry(id) {
  const v = currentData.find(item => item.id == id);
  if (!v) return;

  if (!el('adminPanel').classList.contains('active')) {
    el('adminPanel').classList.add('active');
    document.body.classList.add('admin-active');
  }

  el('editId').value = v.id;
  el('f_pathologie').value = v.pathologie || '';
  el('f_vaccins').value = v.vaccins || '';
  el('f_calendrier').value = v.calendrier || '';
  el('f_lien').value = v.lien || '';
  el('f_couleur').value = v.couleur || getFallbackColor(v.pathologie);
  quillDetails.root.innerHTML = v.details || '';
  quillRattrapage.root.innerHTML = v.rattrapage || '';
  el('cancelEditBtn').classList.remove('hidden');
  el('adminPanel').scrollIntoView({ behavior: 'smooth' });
}

async function deleteEntry(id) {
  if (!confirm('Supprimer définitivement cette ligne ?')) return;
  const { error } = await sbVaccin.from(TABLE_NAME).delete().eq('id', id);
  if (error) showMessage(error.message, true);
  else {
    showMessage('Ligne supprimée !');
    await loadData();
  }
}

function resetForm() {
  el('addForm').reset();
  el('editId').value = '';
  quillDetails.root.innerHTML = '';
  quillRattrapage.root.innerHTML = '';
  el('cancelEditBtn').classList.add('hidden');
}

async function saveSettings() {
  const payload = {
    pathologie: '__PARAMETRES__',
    vaccins: 'Ligne système - Ne pas supprimer',
    calendrier: el('adminDateInput').value,
    rattrapage: el('adminLegendInput').value,
    details: el('adminSituationsInput').value
  };

  const res = settingsId
    ? await sbVaccin.from(TABLE_NAME).update(payload).eq('id', settingsId)
    : await sbVaccin.from(TABLE_NAME).insert([payload]);

  if (res && res.error) showMessage(res.error.message, true);
  else {
    showMessage('Paramètres enregistrés !');
    await loadData();
  }
}

function exportData() {
  if (currentData.length === 0) return;
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(currentData, null, 2));
  const dl = document.createElement('a');
  dl.setAttribute('href', dataStr);
  dl.setAttribute('download', 'vaccins.json');
  dl.click();
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const imported = JSON.parse(e.target.result);
      const { error } = await sbVaccin.from(TABLE_NAME).insert(imported);
      if (error) throw error;
      showMessage('Données importées avec succès !');
      event.target.value = '';
      await loadData();
    } catch (err) {
      showMessage('Erreur d\'import : ' + err.message, true);
    }
  };
  reader.readAsText(file);
}

window.onload = init;
