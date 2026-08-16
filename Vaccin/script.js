// --- CONFIGURATION ---
const SUPABASE_URL = 'https://kpjflntnotftpzffjbud.supabase.co/';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwamZsbnRub3RmdHB6ZmZqYnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODg0MjMsImV4cCI6MjEwMTg2NDQyM30.mTjm86Thn6VUOAAJRWCsGMcR0Ip-qEP08fJdwUvKKEo';

const sbAuth = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'portail' } });
const sbVaccin = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'autres' } });
const TABLE_NAME = 'vaccins';

// --- ETAT GLOBAL ---
let currentData = [];
let filteredData = [];
let settingsId = null; 
let isAdmin = false;

// Variables pour le tri
let sortCol = 'pathologie';
let sortAsc = true;

// Initialisation de Quill (WYSIWYG)
const quillDetails = new Quill('#f_details', { theme: 'snow' });
const quillRattrapage = new Quill('#f_rattrapage', { theme: 'snow' });

const el = id => document.getElementById(id);

// --- UTILITAIRES ---
// Système de Toast
function showMessage(msg, isError = false) {
  const container = el('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : 'success'}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(unsafe) {
  if(!unsafe) return '';
  return unsafe.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function stripHTML(html) {
  return (html || '').replace(/<[^>]*>?/gm, '');
}

// Ancienne fonction de couleur, gardée au cas où la DB n'a pas de couleur assignée
function getFallbackColor(patho) {
  if (!patho) return '#7F8C8D';
  const p = patho.toLowerCase();
  if (p.includes('bcg') || p.includes('tuberculose')) return '#8E44AD'; 
  if (p.includes('diphtérie') || p.includes('tétanos') || p.includes('coqueluche') || p.includes('poliomyélite')) return '#16A085';
  if (p.includes('hépatite')) return '#F39C12'; 
  if (p.includes('méningocoque') || p.includes('rougeole') || p.includes('pneumocoque')) return '#E83A5D'; 
  if (p.includes('papillomavirus') || p.includes('hpv')) return '#E67E22'; 
  if (p.includes('grippe') || p.includes('leptospirose')) return '#3498DB'; 
  if (p.includes('rage')) return '#F1C40F'; 
  if (p.includes('choléra') || p.includes('dengue')) return '#2980B9'; 
  if (p.includes('rotavirus') || p.includes('covid') || p.includes('mpox')) return '#607D8B'; 
  return '#7F8C8D'; 
}

// --- INITIALISATION ---
async function init() {
  const { data: { session } } = await sbAuth.auth.getSession();
  if (session) {
    const { data: profile } = await sbAuth.from('profiles').select('role').eq('id', session.user.id).single();
    if (profile && profile.role === 'admin') {
      isAdmin = true;
      el('toggleAdminBtn').classList.remove('hidden');
    }
  }
  
  setupEventListeners();
  await loadData();
}

function setupEventListeners() {
  el('toggleAdminBtn').addEventListener('click', () => { 
    el('adminPanel').classList.toggle('active'); 
    document.body.classList.toggle('admin-active');
  });

  el('searchInput').addEventListener('input', filterTable);
  el('filterParticularity').addEventListener('change', filterTable);
  el('saveSettingsBtn').addEventListener('click', saveSettings);
  el('importFile').addEventListener('change', importData);
  el('exportBtn').addEventListener('click', exportData);
  
  el('vaccinModal').addEventListener('click', (e) => { if(e.target === el('vaccinModal')) closeModal(); });
  el('closeModalBtn').addEventListener('click', closeModal);
  el('addForm').addEventListener('submit', saveEntry);

  // Écouteurs pour le tri
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-col');
      if (sortCol === col) sortAsc = !sortAsc;
      else { sortCol = col; sortAsc = true; }
      
      document.querySelectorAll('th.sortable').forEach(el => el.classList.remove('asc', 'desc'));
      th.classList.add(sortAsc ? 'asc' : 'desc');
      
      applySortAndRender();
    });
  });
}

// --- CHARGEMENT DES DONNÉES ---
async function loadData() {
  const { data, error } = await sbVaccin.from(TABLE_NAME).select('*');
  if (error) {
    el('vaccineTbody').innerHTML = `<tr><td colspan="3">Erreur: ${error.message}</td></tr>`;
    return;
  }
  
  const settingsEntry = data.find(item => item.pathologie === '__PARAMETRES__');
  const defaultSituations = "VIH : Patients sous VIH\nImmunodéprimé : Immunodéprimé\nGrossesse : Grossesse / Femmes enceintes\nVoyage : Voyageurs";
  
  if (settingsEntry) {
    settingsId = settingsEntry.id;
    el('adminDateInput').value = settingsEntry.calendrier || '';
    el('adminLegendInput').value = settingsEntry.rattrapage || '';
    el('adminSituationsInput').value = settingsEntry.details || defaultSituations;
    
    el('legendText').textContent = settingsEntry.rattrapage || el('legendText').textContent;
    if (settingsEntry.calendrier) {
      const dateObj = new Date(settingsEntry.calendrier);
      el('lastUpdated').textContent = "Dernière mise à jour : " + dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    } else {
      autoCalculateDate(data);
    }
    updateFilterSelect(settingsEntry.details || defaultSituations);
  } else {
    settingsId = null;
    el('adminLegendInput').value = el('legendText').textContent; 
    el('adminSituationsInput').value = defaultSituations;
    updateFilterSelect(defaultSituations);
    autoCalculateDate(data);
  }

  currentData = data.filter(item => item.pathologie !== '__PARAMETRES__') || [];
  filterTable(); // Applique filtres et tris initiaux
}

function autoCalculateDate(dataArr) {
  const regularData = dataArr.filter(item => item.pathologie !== '__PARAMETRES__');
  if(regularData.length > 0) {
    const dates = regularData.map(v => new Date(v.created_at || Date.now()));
    const maxDate = new Date(Math.max.apply(null, dates));
    el('lastUpdated').textContent = "Dernière mise à jour : " + maxDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } else {
    el('lastUpdated').textContent = "Aucune donnée";
  }
}

function updateFilterSelect(situationsText) {
  const select = el('filterParticularity');
  select.innerHTML = '<option value="">-- Toutes les situations --</option>';
  if (!situationsText) return;
  
  situationsText.split('\n').forEach(line => {
    if(!line.trim()) return;
    const parts = line.split(':');
    const val = parts[0].trim();
    const label = parts.length > 1 ? parts.slice(1).join(':').trim() : val;
    
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    select.appendChild(opt);
  });
}

// --- LOGIQUE DE TRI ET FILTRE ---
function filterTable() {
  const query = el('searchInput').value.toLowerCase().trim();
  const particularity = el('filterParticularity').value.toLowerCase();

  filteredData = currentData.filter(v => {
    const txtPatho = (v.pathologie || '').toLowerCase();
    const txtVaccins = (v.vaccins || '').toLowerCase();
    const txtCal = (v.calendrier || '').toLowerCase();
    
    const matchSearch = txtPatho.includes(query) || txtVaccins.includes(query) || txtCal.includes(query);
    
    let matchFilter = true;
    if (particularity !== "") {
      const plainDetails = stripHTML(v.details).toLowerCase();
      const plainRattrapage = stripHTML(v.rattrapage).toLowerCase();
      const allText = `${txtPatho} ${txtVaccins} ${txtCal} ${plainDetails} ${plainRattrapage}`;
      matchFilter = allText.includes(particularity);
    }
    return matchSearch && matchFilter;
  });
  
  applySortAndRender();
}

function applySortAndRender() {
  filteredData.sort((a, b) => {
    let valA = (a[sortCol] || '').toLowerCase();
    let valB = (b[sortCol] || '').toLowerCase();
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });
  renderTable(filteredData);
}

// Fonction de surlignage
function highlight(text, query) {
  const safeText = escapeHtml(text);
  if (!query) return safeText;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return safeText.replace(regex, '<mark>$1</mark>');
}

function renderTable(dataArray) {
  const tbody = el('vaccineTbody');
  const query = el('searchInput').value.trim();

  if (dataArray.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Aucun vaccin trouvé.</td></tr>';
    return;
  }

  tbody.innerHTML = dataArray.map(v => {
    const color = v.couleur || getFallbackColor(v.pathologie);
    
    return `<tr onclick="openModal('${v.id}')">
      <td class="col-patho" style="background-color: ${color};">${highlight(v.pathologie, query)}</td>
      <td class="col-vaccin">${highlight(v.vaccins, query)}</td>
      <td class="col-cal">
        ${highlight(v.calendrier, query)}
        <div class="no-print" style="margin-top: 8px;">
          ${v.lien ? `<a href="${escapeHtml(v.lien)}" target="_blank" class="btn link-btn" style="padding:4px 8px; font-size:11px; display:inline-flex;" onclick="event.stopPropagation();">📚 Fiche Pathologie</a>` : ''}
          ${isAdmin ? `
            <span class="inline-admin-btns">
              <button class="btn admin-btn" style="padding:4px 8px; font-size:11px; margin-left:5px;" onclick="editEntry('${v.id}'); event.stopPropagation();">Éditer</button>
              <button class="btn danger-btn" style="padding:4px 8px; font-size:11px; margin-left:5px;" onclick="deleteEntry('${v.id}'); event.stopPropagation();">Supprimer</button>
            </span>
          ` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// --- GESTION DE LA MODALE ---
function openModal(id) {
  const v = currentData.find(item => item.id == id);
  if (!v) return;
  
  el('modalPathologieTag').textContent = v.pathologie;
  el('modalPathologieTag').style.backgroundColor = v.couleur || getFallbackColor(v.pathologie);
  el('modalNom').textContent = v.vaccins;
  
  // Utilise l'HTML généré par Quill (sans échapper)
  el('modalDetails').innerHTML = v.details || '<p>Aucune information.</p>';
  el('modalRattrapage').innerHTML = v.rattrapage || '<p>Non spécifié.</p>';
  
  el('vaccinModal').classList.add('active');
}

function closeModal() { el('vaccinModal').classList.remove('active'); }

// --- ADMINISTRATION DES DONNÉES ---
async function saveEntry(e) {
  e.preventDefault();
  const id = el('editId').value;
  
  const payload = {
    pathologie: el('f_pathologie').value,
    vaccins: el('f_vaccins').value,
    calendrier: el('f_calendrier').value,
    lien: el('f_lien').value, 
    couleur: el('f_couleur').value, 
    details: quillDetails.root.innerHTML, // Récupère le code HTML de l'éditeur
    rattrapage: quillRattrapage.root.innerHTML
  };

  el('saveBtn').textContent = '...';
  const res = id ? await sbVaccin.from(TABLE_NAME).update(payload).eq('id', id) : await sbVaccin.from(TABLE_NAME).insert([payload]);
  el('saveBtn').textContent = 'Enregistrer';

  if (res.error) {
    showMessage(res.error.message, true);
  } else { 
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
  
  // Charge l'HTML dans les éditeurs
  quillDetails.root.innerHTML = v.details || '';
  quillRattrapage.root.innerHTML = v.rattrapage || '';
  
  el('cancelEditBtn').classList.remove('hidden');
  el('adminPanel').scrollIntoView({behavior: "smooth"});
}

async function deleteEntry(id) {
  if(!confirm("Êtes-vous sûr de vouloir supprimer définitivement cette ligne ?")) return;
  const { error } = await sbVaccin.from(TABLE_NAME).delete().eq('id', id);
  if (error) {
    showMessage(error.message, true);
  } else {
    showMessage("Ligne supprimée !");
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

// --- PARAMÈTRES ET IMPORT/EXPORT ---
async function saveSettings() {
  const payload = {
    pathologie: '__PARAMETRES__',
    vaccins: 'Ligne système - Ne pas supprimer',
    calendrier: el('adminDateInput').value,
    rattrapage: el('adminLegendInput').value,
    details: el('adminSituationsInput').value
  };

  let res = settingsId 
    ? await sbVaccin.from(TABLE_NAME).update(payload).eq('id', settingsId)
    : await sbVaccin.from(TABLE_NAME).insert([payload]);

  if (res && res.error) showMessage(res.error.message, true);
  else { showMessage('Paramètres enregistrés !'); await loadData(); }
}

function exportData() {
  if (currentData.length === 0) return;
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentData, null, 2));
  const dl = document.createElement('a'); dl.setAttribute("href", dataStr); dl.setAttribute("download", "vaccins.json"); dl.click();
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      const { error } = await sbVaccin.from(TABLE_NAME).insert(imported);
      if (error) throw error;
      showMessage("Données importées avec succès !"); 
      event.target.value = ''; 
      await loadData();
    } catch (err) { 
      showMessage("Erreur d'import : " + err.message, true); 
    }
  };
  reader.readAsText(file);
}

// --- DÉMARRAGE ---
window.onload = init;