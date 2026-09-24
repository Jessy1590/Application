// Si la variable window.dataFromPython existe (injectée par data.js), on l'utilise directement
// Sinon, on affiche un message d'erreur

// Fonction de notification pour le feedback utilisateur
function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span class="close">&times;</span>
        ${message}
    `;
    
    document.body.appendChild(notification);
    
    // Animation d'entrée
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Fermeture automatique
    const autoClose = setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => document.body.removeChild(notification), 300);
    }, duration);
    
    // Fermeture manuelle
    notification.querySelector('.close').onclick = () => {
        clearTimeout(autoClose);
        notification.classList.remove('show');
        setTimeout(() => document.body.removeChild(notification), 300);
    };
}

// Système de recherche avancée
let searchHistory = [];
const MAX_SEARCH_HISTORY = 10;

function addToSearchHistory(searchTerm) {
    if (searchTerm && searchTerm.trim() !== '') {
        searchHistory = searchHistory.filter(item => item !== searchTerm);
        searchHistory.unshift(searchTerm);
        if (searchHistory.length > MAX_SEARCH_HISTORY) {
            searchHistory.pop();
        }
        localStorage.setItem('thesaurus_search_history', JSON.stringify(searchHistory));
    }
}

function getSearchHistory() {
    const saved = localStorage.getItem('thesaurus_search_history');
    return saved ? JSON.parse(saved) : [];
}

function clearSearchHistory() {
    searchHistory = [];
    localStorage.removeItem('thesaurus_search_history');
}

// Fonction de recherche avancée
function advancedSearch(query, filters = {}) {
    if (!window.dataFromPython || !Array.isArray(window.dataFromPython.tableData)) {
        return [];
    }
    
    const data = window.dataFromPython.tableData;
    let results = data;
    
    // Recherche textuelle
    if (query && query.trim() !== '') {
        const searchTerm = query.toLowerCase();
        results = results.filter(row => {
            return (
                (row.DCI && row.DCI.toLowerCase().includes(searchTerm)) ||
                (row['Famille de molécule'] && row['Famille de molécule'].toLowerCase().includes(searchTerm)) ||
                (row.Surveillance && row.Surveillance.toLowerCase().includes(searchTerm)) ||
                (row.Indications && row.Indications.toLowerCase().includes(searchTerm)) ||
                (row['Détails produit'] && row['Détails produit'].toLowerCase().includes(searchTerm))
            );
        });
    }
    
    // Filtres par famille
    if (filters.famille && filters.famille !== '') {
        results = results.filter(row => 
            row['Famille de molécule'] && 
            row['Famille de molécule'].toLowerCase() === filters.famille.toLowerCase()
        );
    }
    
    // Filtres par remboursement
    if (filters.remboursements && filters.remboursements.length > 0) {
        results = results.filter(row => {
            if (!row.Indications_Data || !Array.isArray(row.Indications_Data)) return false;
            return row.Indications_Data.some(indication => 
                filters.remboursements.includes(indication.remboursement)
            );
        });
    }
    
    return results;
}

// Fonctions d'export de données
function exportToCSV(data, filename = 'thesaurus_export.csv') {
    if (!data || data.length === 0) {
        showNotification('Aucune donnée à exporter', 'warning');
        return;
    }
    
    // Créer les en-têtes
    const headers = ['DCI', 'Famille de molécule', 'Surveillance', 'Indications'];
    let csvContent = headers.join(',') + '\n';
    
    // Ajouter les données
    data.forEach(row => {
        const rowData = [
            `"${(row.DCI || '').replace(/"/g, '""')}"`,
            `"${(row['Famille de molécule'] || '').replace(/"/g, '""')}"`,
            `"${(row.Surveillance || '').replace(/"/g, '""')}"`,
            `"${(row.Indications || '').replace(/"/g, '""')}"`
        ];
        csvContent += rowData.join(',') + '\n';
    });
    
    // Télécharger le fichier
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    
    showNotification(`Export CSV réussi : ${data.length} molécules`, 'success');
}

function exportToExcel(data, filename = 'thesaurus_export.xlsx') {
    if (!data || data.length === 0) {
        showNotification('Aucune donnée à exporter', 'warning');
        return;
    }
    
    try {
        // Préparer les données pour l'export Excel (comme dans l'impression)
        const excelData = data.map(row => {
            const cleanRow = {};
            
            // Copier les données de base
            Object.keys(row).forEach(key => {
                if (key !== 'Détails produit' && key !== 'Famille de molécule' && key !== 'Fiche' && key !== 'Indications_Data') {
                    let value = row[key];
                    
                    // Traiter les indications spécialement
                    if (key === 'Indications' && Array.isArray(row['Indications_Data']) && row['Indications_Data'].length > 0) {
                        value = row['Indications_Data'].map(indication => {
                            let indicationText = indication.indication ? indication.indication.trim() : '';
                            if (indication.remboursement) {
                                indicationText += ` (${indication.remboursement})`;
                            }
                            if (indication.posologie && indication.posologie.trim() !== '') {
                                indicationText += ` - Posologie: ${indication.posologie}`;
                            }
                            return indicationText;
                        }).join('\n');
                    }
                    
                    // Traiter la surveillance
                    if (key === 'Surveillance' && value && value.trim() !== '') {
                        let surveillances = value.includes('•') ? value.split(/\n|\r|•/).map(x => x.trim()).filter(Boolean) : value.split(/\n|\r/).map(x => x.trim()).filter(Boolean);
                        surveillances = Array.from(new Set(surveillances));
                        value = surveillances.join('\n');
                    }
                    
                    cleanRow[key] = value;
                }
            });
            
            return cleanRow;
        });
        
        // Créer le contenu CSV (format compatible Excel)
        const headers = Object.keys(excelData[0]);
        const csvContent = [
            headers.join(','),
            ...excelData.map(row => 
                headers.map(header => {
                    let value = row[header] || '';
                    // Échapper les virgules et guillemets
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                        value = `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                }).join(',')
            )
        ].join('\n');
        
        // Créer le fichier avec l'extension .xlsx (mais contenu CSV)
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification(`Export Excel réussi : ${data.length} molécules`, 'success');
    } catch (error) {
        console.error('Erreur lors de l\'export Excel:', error);
        showNotification('Erreur lors de l\'export Excel', 'error');
    }
}

function exportFilteredData() {
    if (!window.dataFromPython || !Array.isArray(window.dataFromPython.tableData)) {
        showNotification('Aucune donnée disponible', 'error');
        return;
    }
    
    const data = window.dataFromPython.tableData;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    
    // Créer un menu d'export
    const exportMenu = document.createElement('div');
    exportMenu.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10001;
        min-width: 300px;
    `;
    
    exportMenu.innerHTML = `
        <h3 style="margin-top: 0;">📤 Exporter les données</h3>
        <p>Choisissez le format d'export :</p>
        <button onclick="exportToExcel(window.dataFromPython.tableData, 'thesaurus_${timestamp}.xlsx')" style="width: 100%; margin: 5px 0; padding: 10px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer;">
            📊 Export Excel
        </button>
        <button onclick="exportToCSV(window.dataFromPython.tableData, 'thesaurus_${timestamp}.csv')" style="width: 100%; margin: 5px 0; padding: 10px; background: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer;">
            📄 Export CSV
        </button>
        <button onclick="document.body.removeChild(this.parentElement)" style="width: 100%; margin: 5px 0; padding: 10px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">
            ❌ Annuler
        </button>
    `;
    
    document.body.appendChild(exportMenu);
}

// Fonction pour afficher les statistiques du thésaurus
function showStatistics() {
    if (!window.dataFromPython || !Array.isArray(window.dataFromPython.tableData)) {
        showNotification('Aucune donnée disponible pour les statistiques', 'error');
        return;
    }
    
    const data = window.dataFromPython.tableData;
    
    // Calculer les statistiques
    const stats = {
        totalMolecules: data.length,
        families: {},
        remboursements: {},
        moleculesWithSurveillance: 0,
        moleculesWithPosologie: 0
    };
    
    data.forEach(row => {
        // Familles de molécules
        const famille = row['Famille de molécule'] || 'Non spécifiée';
        stats.families[famille] = (stats.families[famille] || 0) + 1;
        
        // Surveillance
        if (row.Surveillance && row.Surveillance.trim() !== '') {
            stats.moleculesWithSurveillance++;
        }
        
        // Indications avec posologie
        if (row.Indications_Data && Array.isArray(row.Indications_Data)) {
            row.Indications_Data.forEach(indication => {
                if (indication.remboursement) {
                    stats.remboursements[indication.remboursement] = (stats.remboursements[indication.remboursement] || 0) + 1;
                }
                if (indication.posologie && indication.posologie.trim() !== '') {
                    stats.moleculesWithPosologie++;
                }
            });
        }
    });
    
    // Créer la modal de statistiques
    const statsModal = document.createElement('div');
    statsModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    const statsContent = document.createElement('div');
    statsContent.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 12px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        position: relative;
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 15px;
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
    `;
    closeBtn.onclick = () => document.body.removeChild(statsModal);
    
    statsContent.innerHTML = `
        <h2 style="margin-top: 0; color: #1976d2;">📊 Statistiques du Thésaurus</h2>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0;">
            <div style="background: #e3f2fd; padding: 15px; border-radius: 8px;">
                <h3 style="margin: 0; color: #1976d2;">🧬 Molécules</h3>
                <p style="font-size: 2em; margin: 10px 0; color: #1976d2;">${stats.totalMolecules}</p>
                <p style="margin: 0; color: #666;">Total</p>
            </div>
            <div style="background: #e8f5e8; padding: 15px; border-radius: 8px;">
                <h3 style="margin: 0; color: #2e7d32;">👁️ Surveillance</h3>
                <p style="font-size: 2em; margin: 10px 0; color: #2e7d32;">${stats.moleculesWithSurveillance}</p>
                <p style="margin: 0; color: #666;">Avec surveillance</p>
            </div>
        </div>
        
        <h3 style="color: #1976d2;">🏷️ Familles de molécules</h3>
        <div style="margin: 15px 0;">
            ${Object.entries(stats.families).map(([famille, count]) => `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                    <span>${famille}</span>
                    <span style="font-weight: bold; color: #1976d2;">${count}</span>
                </div>
            `).join('')}
        </div>
        
        <h3 style="color: #1976d2;">💰 Types de remboursement</h3>
        <div style="margin: 15px 0;">
            ${Object.entries(stats.remboursements).map(([remb, count]) => `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                    <span>${remb}</span>
                    <span style="font-weight: bold; color: #1976d2;">${count}</span>
                </div>
            `).join('')}
        </div>
        
        <div style="text-align: center; margin-top: 20px;">
            <small style="color: #666;">Dernière mise à jour : ${window.dataFromPython.lastUpdate || 'Non disponible'}</small>
        </div>
    `;
    
    statsContent.appendChild(closeBtn);
    statsModal.appendChild(statsContent);
    document.body.appendChild(statsModal);
    
    // Fermer en cliquant à l'extérieur
    statsModal.onclick = (e) => {
        if (e.target === statsModal) {
            document.body.removeChild(statsModal);
        }
    };
}

document.addEventListener('DOMContentLoaded', () => {
    // Gestion du menu déroulant
    const menuBtn = document.getElementById('menu-btn');
    const menuDropdown = document.getElementById('menu-dropdown');
    const infoMenuBtn = document.getElementById('info-menu-btn');
    const searchMenuBtn = document.getElementById('search-menu-btn');
    
    // Ouvrir/fermer le menu
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menuDropdown.classList.toggle('hidden');
    });
    
    // Fermer le menu en cliquant à l'extérieur
    document.addEventListener('click', (e) => {
        if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
            menuDropdown.classList.add('hidden');
        }
    });
    
    // Fermer le menu après avoir cliqué sur un élément
    menuDropdown.addEventListener('click', (e) => {
        if (e.target.classList.contains('menu-item')) {
            setTimeout(() => {
                menuDropdown.classList.add('hidden');
            }, 100);
        }
    });
    
    // Reconnecter les événements pour les boutons du menu
    if (infoMenuBtn) {
        infoMenuBtn.addEventListener('click', () => {
            const infoModal = document.getElementById('info-modal');
            if (infoModal) {
                infoModal.classList.remove('hidden');
            }
        });
    }
    
    if (searchMenuBtn) {
        searchMenuBtn.addEventListener('click', () => {
            const searchModal = document.getElementById('search-modal');
            if (searchModal) {
                // Générer le contenu de recherche
                generateSearchContent();
                searchModal.classList.remove('hidden');
            }
        });
    }

    // Variables pour mémoriser les derniers filtres appliqués
    let lastDciVal = '';
    let lastIndVal = '';
    let lastFamilleVal = '';
    let lastRembChecked = ['AMM', 'Hors AMM', 'AMM non remboursé', 'RTU', 'Groupe 3', 'Liste en sus'];

    // Fonction pour générer le contenu de recherche
    function generateSearchContent() {
        const searchBody = document.getElementById('search-body');
        if (!searchBody || !window.dataFromPython || !Array.isArray(window.dataFromPython.tableData)) {
            return;
        }
        
        const allData = window.dataFromPython.tableData;
        
        // Générer la liste des DCI uniques (triées)
        const dciList = Array.from(new Set(allData.map(row => row.DCI))).sort((a, b) => a.localeCompare(b, 'fr', {sensitivity:'base'}));
        
        // Générer la liste des indications uniques (triées) - AMÉLIORÉ
        let indicationsSet = new Set();
        allData.forEach(row => {
            if (row.Indications && typeof row.Indications === 'string') {
                row.Indications.split('\n').forEach(item => {
                    const ind = item.replace(/^•\s*/, '').replace(/\s*\([^)]*\)$/, '').trim();
                    if (ind) indicationsSet.add(ind);
                });
            }
            // Ajouter aussi les indications depuis Indications_Data
            if (Array.isArray(row.Indications_Data)) {
                row.Indications_Data.forEach(indObj => {
                    if (indObj.indication) {
                        const ind = indObj.indication.trim();
                        if (ind) indicationsSet.add(ind);
                    }
                });
            }
        });
        const indicationsList = Array.from(indicationsSet).sort((a, b) => a.localeCompare(b, 'fr', {sensitivity:'base'}));
        
        // Générer la liste des familles de molécule uniques
        const familleSet = new Set(allData.map(row => row['Famille de molécule'] || '').filter(Boolean));
        const familleList = Array.from(familleSet).sort((a, b) => a.localeCompare(b, 'fr', {sensitivity:'base'}));
        
        // Générer le formulaire avec valeurs mémorisées
        searchBody.innerHTML = `
            <label for='dci-select'><b>Filtrer par DCI :</b></label><br>
            <input list='dci-datalist' id='dci-select' placeholder='Commencez à taper une DCI...' style='width:90%;margin-bottom:12px;padding:6px;' value="${lastDciVal}">
            <datalist id='dci-datalist'>
                ${dciList.map(dci => `<option value="${dci}">`).join('')}
            </datalist>
            <br>
            <label for='indication-select'><b>Filtrer par indication :</b></label><br>
            <input list='indication-datalist' id='indication-select' placeholder='Commencez à taper une indication...' style='width:90%;margin-bottom:12px;padding:6px;' value="${lastIndVal}">
            <datalist id='indication-datalist'>
                ${indicationsList.map(ind => `<option value="${ind}">`).join('')}
            </datalist>
            <br>
            <label for='famille-select'><b>Filtrer par famille de molécule :</b></label><br>
            <select id='famille-select' style='width:90%;margin-bottom:12px;padding:6px;'>
                <option value=''>Toutes</option>
                ${familleList.map(fam => `<option value="${fam}"${lastFamilleVal === fam ? ' selected' : ''}>${fam}</option>`).join('')}
            </select>
            <br>
            <b>Filtrer les indications par remboursement :</b><br>
            <label><input type='checkbox' class='remb-filter' value='AMM' ${lastRembChecked.includes('AMM') ? 'checked' : ''}> AMM</label>
            <label><input type='checkbox' class='remb-filter' value='Hors AMM' ${lastRembChecked.includes('Hors AMM') ? 'checked' : ''}> Hors AMM</label>
            <label><input type='checkbox' class='remb-filter' value='AMM non remboursé' ${lastRembChecked.includes('AMM non remboursé') ? 'checked' : ''}> AMM non remboursé</label>
            <label><input type='checkbox' class='remb-filter' value='RTU' ${lastRembChecked.includes('RTU') ? 'checked' : ''}> RTU</label>
            <label><input type='checkbox' class='remb-filter' value='Groupe 3' ${lastRembChecked.includes('Groupe 3') ? 'checked' : ''}> Groupe 3</label>
            <label><input type='checkbox' class='remb-filter' value='Liste en sus' ${lastRembChecked.includes('Liste en sus') ? 'checked' : ''}> Liste en sus</label>
            <br><br>
            <button id='apply-search' style='margin-right:10px;'>Appliquer</button>
            <button id='reset-search'>Réinitialiser</button>
        `;
    }

    // Reconnecter les événements de fermeture des modales
    const closeModal = document.getElementById('close-modal');
    const closeSearchModal = document.getElementById('close-search-modal');
    const closeProductModal = document.getElementById('close-product-modal');
    const closeFicheModal = document.getElementById('close-fiche-modal');
    const closePosologieModal = document.getElementById('close-posologie-modal');
    const infoModal = document.getElementById('info-modal');
    const searchModal = document.getElementById('search-modal');
    const ficheModal = document.getElementById('fiche-modal');
    const productModal = document.getElementById('product-modal');
    const posologieModal = document.getElementById('posologie-modal');
    
    if (closeModal && infoModal) {
        closeModal.onclick = () => infoModal.classList.add('hidden');
        infoModal.onclick = (e) => { 
            if (e.target === infoModal) infoModal.classList.add('hidden'); 
        };
    }
    
    if (closeSearchModal && searchModal) {
        closeSearchModal.onclick = () => searchModal.classList.add('hidden');
        searchModal.onclick = (e) => { 
            if (e.target === searchModal) searchModal.classList.add('hidden'); 
        };
    }
    
    // Event listeners pour les modales fiche, produits et posologie
    if (closeFicheModal && ficheModal) {
        closeFicheModal.onclick = () => ficheModal.classList.add('hidden');
        ficheModal.onclick = (e) => { 
            if (e.target === ficheModal) ficheModal.classList.add('hidden'); 
        };
    }
    
    if (closeProductModal && productModal) {
        closeProductModal.onclick = () => productModal.classList.add('hidden');
        productModal.onclick = (e) => { 
            if (e.target === productModal) productModal.classList.add('hidden'); 
        };
    }
    
    if (closePosologieModal && posologieModal) {
        closePosologieModal.onclick = () => posologieModal.classList.add('hidden');
        posologieModal.onclick = (e) => { 
            if (e.target === posologieModal) posologieModal.classList.add('hidden'); 
        };
    }

    const container = document.getElementById('table-container');
    
    // Ajout d'un état de chargement amélioré
    if (!window.dataFromPython || !Array.isArray(window.dataFromPython.tableData)) {
        container.innerHTML = `
            <div class="loader" style="text-align: center; padding: 40px;">
                <div style="font-size: 1.2rem; color: #666; margin-bottom: 20px;">Chargement du thésaurus...</div>
                <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #1976d2; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </div>
        `;
        return;
    }

    const legendContainer = document.createElement('div');
    legendContainer.className = 'legend';

    const data = window.dataFromPython.tableData;
    const lastUpdate = window.dataFromPython.lastUpdate;
    
    // Vérification de la qualité des données
    if (!data || data.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #e74c3c;">
                <div style="font-size: 1.2rem; margin-bottom: 10px;">Aucune donnée disponible</div>
                <div>Veuillez contacter l'administrateur pour mettre à jour les données.</div>
            </div>
        `;
        return;
    }

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    // En-têtes
    const headers = Object.keys(data[0]);
    const trHead = document.createElement('tr');
    headers.forEach(h => {
        if (h === 'Détails produit' || h === 'Famille de molécule' || h === 'Fiche' || h === 'Indications_Data') return; // On ne veut plus de ces colonnes
        const th = document.createElement('th');
        th.textContent = h;
        if (h === 'DCI') th.style.textAlign = 'center';
        trHead.appendChild(th);
    });
    thead.appendChild(trHead);

    data.forEach(row => {
        const tr = document.createElement('tr');
        headers.forEach(h => {
            if (h === 'Détails produit' || h === 'Famille de molécule' || h === 'Fiche' || h === 'Indications_Data') return; // On saute ces données ici

            const td = document.createElement('td');
            let val = (row[h] !== undefined && row[h] !== null) ? String(row[h]) : '';

            if (h === 'Indications' && Array.isArray(row['Indications_Data']) && row['Indications_Data'].length > 0) {
                // On affiche toutes les indications, mais le bouton poso seulement si la posologie existe
                const indicationsBlock = document.createElement('div');
                indicationsBlock.style.width = '100%';
                const indicationsData = row['Indications_Data'];
                indicationsData.forEach((indicationObj) => {
                    const indDiv = document.createElement('div');
                    let color = '';
                    const rem = (indicationObj.remboursement || '').toLowerCase();
                        if (rem === 'amm') color = '#43b581';
                        if (rem === 'hors amm') color = '#e74c3c';
                    if (rem === 'amm non remboursé') color = '#a259d9';
                    if (rem === 'rtu') color = '#ff7043';
                        if (rem === 'groupe 3') color = '#5c6bc0';
                        if (rem === 'liste en sus') color = '#fbc02d';
                    if (color) {
                        indDiv.style.background = color;
                        indDiv.style.borderRadius = '6px';
                        indDiv.style.padding = '2px 8px';
                        indDiv.style.marginBottom = '2px';
                        indDiv.style.color = (color === '#ffe082') ? '#000' : '#fff';
                        indDiv.style.width = '100%';
                        indDiv.style.boxSizing = 'border-box';
                    }
                    // Texte indication + remboursement
                    let indicationText = indicationObj.indication ? indicationObj.indication.trim() : '';
                    if (rem) indicationText += ' (' + indicationObj.remboursement + ')';
                    const indicationContainer = document.createElement('span');
                    indicationContainer.textContent = indicationText;
                    // Bouton posologie si dispo
                    if (indicationObj.posologie && indicationObj.posologie.trim() !== '') {
                        const posologieBtn = document.createElement('button');
                        posologieBtn.textContent = 'Poso';
                        posologieBtn.className = 'posologie-btn action-btn';
                        posologieBtn.title = 'Voir la posologie';
                        posologieBtn.onclick = (e) => {
                            e.stopPropagation();
                            const posologieBody = document.getElementById('posologie-body');
                            const posologieModal = document.getElementById('posologie-modal');
                            posologieBody.innerHTML = '';
                            const indicationDiv = document.createElement('div');
                            indicationDiv.style.fontWeight = 'bold';
                            indicationDiv.style.marginBottom = '10px';
                            indicationDiv.style.color = '#333';
                            indicationDiv.textContent = indicationObj.indication;
                            posologieBody.appendChild(indicationDiv);
                            const posologieDiv = document.createElement('div');
                            posologieDiv.innerHTML = indicationObj.posologie.replace(/\n/g, '<br>');
                            posologieBody.appendChild(posologieDiv);
                            posologieModal.classList.remove('hidden');
                        };
                        indicationContainer.appendChild(posologieBtn);
                    }
                    indDiv.appendChild(indicationContainer);
                    indicationsBlock.appendChild(indDiv);
                });
                td.appendChild(indicationsBlock);
            } else if (h === 'Surveillance' && val.trim() !== '') {
                // Affichage multi-lignes façon pastilles, découpe sur les puces ou retours à la ligne, sans doublons
                let surveillances = val.includes('•') ? val.split(/\n|\r|•/).map(x => x.trim()).filter(Boolean) : val.split(/\n|\r/).map(x => x.trim()).filter(Boolean);
                surveillances = Array.from(new Set(surveillances)); // suppression des doublons
                const survBlock = document.createElement('div');
                survBlock.style.width = '100%';
                surveillances.forEach(surv => {
                    const survDiv = document.createElement('div');
                    survDiv.style.background = '#90caf9'; // bleu pastel
                    survDiv.style.borderRadius = '6px';
                    survDiv.style.padding = '2px 8px';
                    survDiv.style.marginBottom = '2px';
                    survDiv.style.color = '#1a2330';
                    survDiv.style.width = '100%';
                    survDiv.style.boxSizing = 'border-box';
                    survDiv.textContent = surv;
                    survBlock.appendChild(survDiv);
                });
                td.appendChild(survBlock);
            } else if (h !== 'Surveillance') {
                // Sinon, on gère les retours à la ligne simples
                td.innerHTML = val.replace(/\n/g, '<br>');
            }

            if (h === 'DCI') {
                td.style.textAlign = 'center';
                td.style.verticalAlign = 'middle';
                // Surlignage selon la famille de molécule
                const famille = row['Famille de molécule'] ? row['Famille de molécule'].toLowerCase() : '';
                if (famille === 'hors taa') {
                    td.style.background = '#8d6e63';
                    td.style.color = '#fff';
                } else if (famille === 'anti infectieux') {
                    td.style.background = '#00bcd4';
                    td.style.color = '#fff';
                }
                // Le nom de la DCI est déjà dans le td.innerHTML
                // On crée un conteneur pour les boutons en dessous
                const btnContainer = document.createElement('div');
                btnContainer.className = 'btn-container';
                btnContainer.style.marginTop = '10px';

                // Ajout du bouton 'Produits' si des détails existent
                const detailsProduit = row['Détails produit'];
                const fiche = row['Fiche'];
                if (detailsProduit && detailsProduit.trim() !== '') {
                    const productBtn = document.createElement('button');
                    productBtn.textContent = 'Produits';
                    productBtn.className = 'product-btn action-btn';
                    productBtn.onclick = () => {
                        const productBody = document.getElementById('product-body');
                        const productModal = document.getElementById('product-modal');
                        productBody.innerHTML = '';
                        // On retire uniquement le contenu exact de la fiche du détail produit
                        let produits = detailsProduit;
                        if (fiche && fiche.trim() !== '') {
                            // On retire la fiche si elle est présente dans le détail produit
                            produits = produits.replace(fiche, '');
                        }
                        produits.split(/\n\n|\r\n\r\n/).forEach(prod => {
                            const lines = prod.split(/\n|\r\n/);
                            lines.forEach((line) => {
                                // On ignore toute ligne qui commence par '• Fiche :' (avec ou sans espaces)
                                if (/^•?\s*Fiche\s*:/i.test(line.trim())) return;
                                const div = document.createElement('div');
                                if (/^\s*Produit \d+\s*:/i.test(line)) {
                                    div.textContent = line.trim();
                                    div.style.background = '#f0f0f0';
                                    div.style.fontWeight = 'bold';
                                    div.style.padding = '2px 8px';
                                    div.style.margin = '6px 0 2px 0';
                                    div.style.borderRadius = '6px';
                                } else if (line.trim().startsWith('•')) {
                                    div.textContent = line.trim();
                                    div.style.marginLeft = '18px';
                                } else {
                                    div.textContent = line.trim();
                                }
                                if (div.textContent.trim() !== '') productBody.appendChild(div);
                            });
                        });
                        productModal.classList.remove('hidden');
                    };
                    btnContainer.appendChild(productBtn);
                }
                
                // Ajout du bouton 'Fiche' si une fiche existe
                if (fiche && fiche.trim() !== '') {
                    const ficheBtn = document.createElement('button');
                    ficheBtn.textContent = 'Fiche';
                    ficheBtn.className = 'fiche-btn action-btn';
                    ficheBtn.onclick = () => {
                        const ficheBody = document.getElementById('fiche-body');
                        const ficheModal = document.getElementById('fiche-modal');
                        // On transforme les liens en hyperliens cliquables
                        let ficheHtml = fiche
                            // Liens web d'abord
                            .replace(/(https?:\/\/[^\s"']+)/gi, '<a href="$1" target="_blank">$1</a>')
                            // Chemins UNC réseau (\\serveur\... ou //serveur/...) qui ne sont pas déjà dans un lien web
                            .replace(/(^|[^\w:>])((?:\\\\|\/\/)[^\s"']+)/g, function(match, p1, p2) {
                                // On ne transforme pas si précédé de http(s):
                                if (/https?:$/.test(p1)) return match;
                                return p1 + `<a href="file:///${p2.replace(/\\/g, '/')}" target="_blank">${p2}</a>`;
                            })
                            // Chemins locaux de type X:\... ou X:/...
                            .replace(/\b([A-Z]:[\\/][^\s"']+)/gi, function(match) {
                                return `<a href="file:///${match.replace(/\\/g, '/')}" target="_blank">${match}</a>`;
                        });
                        ficheBody.innerHTML = ficheHtml.replace(/\n/g, '<br>');
                        ficheModal.classList.remove('hidden');
                    };
                    btnContainer.appendChild(ficheBtn);
                }

                if (btnContainer.hasChildNodes()) {
                    td.appendChild(btnContainer);
                }
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

    // Ajouter la logique de recherche pour les boutons du menu
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'apply-search') {
            const searchModal = document.getElementById('search-modal');
            const searchBody = document.getElementById('search-body');
            
            if (!searchModal || !searchBody || !window.dataFromPython || !Array.isArray(window.dataFromPython.tableData)) {
                return;
            }
            
            const allData = window.dataFromPython.tableData;
            const lastUpdate = window.dataFromPython.lastUpdate;
            
            const dciVal = document.getElementById('dci-select').value.trim();
            const indVal = document.getElementById('indication-select').value.trim();
            const familleVal = document.getElementById('famille-select').value.trim();
            const rembChecked = Array.from(document.querySelectorAll('.remb-filter:checked')).map(cb => cb.value);
            
            // Correction : si aucun filtre n'est appliqué, on affiche tout
            if (!dciVal && !indVal && !familleVal && rembChecked.length === 6) {
                renderTable(allData, lastUpdate);
                searchModal.classList.add('hidden');
                return;
            }
            
            // Mémoriser les derniers filtres
            lastDciVal = dciVal;
            lastIndVal = indVal;
            lastFamilleVal = familleVal;
            lastRembChecked = rembChecked.length ? rembChecked : [];
            
            // Filtrage
            let filtered = allData;
            
            // 1. Filtre DCI
            if (dciVal) {
                filtered = filtered.filter(row => (row.DCI || '').toLowerCase() === dciVal.toLowerCase());
            }
            
            // 2. Filtre famille
            if (familleVal) {
                filtered = filtered.filter(row => (row['Famille de molécule'] || '').toLowerCase() === familleVal.toLowerCase());
            }
            
            // 3. Filtre indication + remboursement (AMÉLIORÉ)
            filtered = filtered.map(row => {
                let newRow = {...row};
                
                // Filtrage des indications textuelles
                if (row.Indications && typeof row.Indications === 'string') {
                    const items = row.Indications.split('\n').filter(Boolean);
                    newRow.Indications = items.filter(item => {
                        let keep = true;
                        
                        // Filtre indication (recherche partielle améliorée)
                        if (indVal && item) {
                            const cleanItem = item.replace(/^•\s*/, '').replace(/\s*\([^)]*\)$/, '').trim().toLowerCase();
                            const searchTerms = indVal.toLowerCase().split(/\s+/);
                            keep = searchTerms.every(term => cleanItem.includes(term));
                        }
                        
                        // Filtre remboursement (seulement si des filtres de remboursement sont actifs)
                        if (keep && rembChecked.length < 6) {
                            const remMatch = item.match(/\(([^)]+)\)/);
                            if (remMatch) {
                                const rem = remMatch[1].toLowerCase();
                                keep = rembChecked.some(val => rem && rem === val.toLowerCase());
                            } else {
                                keep = false;
                            }
                        }
                        
                        return keep;
                    }).join('\n');
                }
                
                // Filtrage des Indications_Data (structure de données)
                if (Array.isArray(row.Indications_Data)) {
                    newRow.Indications_Data = row.Indications_Data.filter(indObj => {
                        let keep = true;
                        
                        // Filtre indication (recherche partielle améliorée)
                        if (indVal && indObj.indication) {
                            const cleanIndication = indObj.indication.toLowerCase();
                            const searchTerms = indVal.toLowerCase().split(/\s+/);
                            keep = searchTerms.every(term => cleanIndication.includes(term));
                        }
                        
                        // Filtre remboursement (seulement si des filtres de remboursement sont actifs)
                        if (keep && rembChecked.length < 6 && indObj.remboursement) {
                            const rem = indObj.remboursement.toLowerCase();
                            keep = rembChecked.some(val => rem && rem === val.toLowerCase());
                        }
                        
                        return keep;
                    });
                }
                
                return newRow;
            })
            // 4. On ne garde que les lignes où il reste au moins une indication après filtrage
            .filter(row => {
                // Si on a un filtre d'indication ou de remboursement, on vérifie qu'il reste des indications
                if (indVal || rembChecked.length < 6) {
                    if (row.Indications_Data !== undefined && Array.isArray(row.Indications_Data)) {
                        return row.Indications_Data.length > 0;
                    }
                    if (row.Indications !== undefined) {
                        return row.Indications && row.Indications.trim() !== '';
                    }
                    return false;
                }
                return true;
            });
            
            // Après le filtrage et juste avant renderTable(filtered, lastUpdate)
            if (filtered.length === 0) {
                // Affiche le message à droite du bouton Réinitialiser
                let noResultMsg = document.getElementById('no-result-msg');
                if (!noResultMsg) {
                    noResultMsg = document.createElement('span');
                    noResultMsg.id = 'no-result-msg';
                    noResultMsg.style.color = '#d32f2f';
                    noResultMsg.style.fontWeight = 'bold';
                    noResultMsg.style.marginLeft = '18px';
                    noResultMsg.textContent = 'pas de résultat';
                    const resetBtn = document.getElementById('reset-search');
                    if (resetBtn) resetBtn.parentNode.insertBefore(noResultMsg, resetBtn.nextSibling);
                } else {
                    noResultMsg.textContent = 'pas de résultat';
                    noResultMsg.style.display = '';
                }
            } else {
                // Cache le message si des résultats existent
                const noResultMsg = document.getElementById('no-result-msg');
                if (noResultMsg) noResultMsg.style.display = 'none';
            }
            
            renderTable(filtered, lastUpdate);
            searchModal.classList.add('hidden');
        }
        
        if (e.target && e.target.id === 'reset-search') {
            if (window.dataFromPython && Array.isArray(window.dataFromPython.tableData)) {
                const allData = window.dataFromPython.tableData;
                const lastUpdate = window.dataFromPython.lastUpdate;
                
                // Réinitialiser toutes les variables de filtres
                lastDciVal = '';
                lastIndVal = '';
                lastFamilleVal = '';
                lastRembChecked = ['AMM', 'Hors AMM', 'AMM non remboursé', 'RTU', 'Groupe 3', 'Liste en sus'];
                
                // Réafficher le tableau complet
                renderTable(allData, lastUpdate);
                
                // Réinitialiser les champs du formulaire et mettre à jour le popup
                const dciSelect = document.getElementById('dci-select');
                const indicationSelect = document.getElementById('indication-select');
                const familleSelect = document.getElementById('famille-select');
                const rembFilters = document.querySelectorAll('.remb-filter');
                
                if (dciSelect) dciSelect.value = '';
                if (indicationSelect) indicationSelect.value = '';
                if (familleSelect) familleSelect.value = '';
                if (rembFilters.length > 0) {
                    rembFilters.forEach(filter => {
                        filter.checked = true; // Cocher tous les remboursements
                    });
                }
                
                // Cacher le message "pas de résultat"
                const noResultMsg = document.getElementById('no-result-msg');
                if (noResultMsg) noResultMsg.style.display = 'none';
                
                // Fermer le popup de recherche
                const searchModal = document.getElementById('search-modal');
                if (searchModal) {
                    searchModal.classList.add('hidden');
                }
            }
        }
    });

    const advancedPrintBtn = document.getElementById('advanced-print-btn');
    if (advancedPrintBtn) {
        advancedPrintBtn.onclick = () => window.open('imprimer.html', '_blank');
    }
});

// Refactorisation du rendu du tableau pour pouvoir le rappeler avec des données filtrées
function renderTable(data, updateDate) {
    const container = document.getElementById('table-container');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    
    // Créer le conteneur pour la date de mise à jour
    const majContainer = document.createElement('div');
    majContainer.className = 'maj';
    majContainer.style.marginTop = '18px';
    majContainer.style.fontSize = '1em';
    // En-têtes
    const headers = Object.keys(data[0]);
    const trHead = document.createElement('tr');
    headers.forEach(h => {
        if (h === 'Détails produit' || h === 'Famille de molécule' || h === 'Fiche' || h === 'Indications_Data') return; // On saute ces données ici
        const th = document.createElement('th');
        th.textContent = h;
        if (h === 'DCI') th.style.textAlign = 'center';
        trHead.appendChild(th);
    });
    thead.appendChild(trHead);

    data.forEach(row => {
        const tr = document.createElement('tr');
        headers.forEach(h => {
            if (h === 'Détails produit' || h === 'Famille de molécule' || h === 'Fiche' || h === 'Indications_Data') return; // On saute ces données ici

            const td = document.createElement('td');
            let val = (row[h] !== undefined && row[h] !== null) ? String(row[h]) : '';

            if (h === 'Indications' && Array.isArray(row['Indications_Data']) && row['Indications_Data'].length > 0) {
                // On affiche toutes les indications, mais le bouton poso seulement si la posologie existe
                const indicationsBlock = document.createElement('div');
                indicationsBlock.style.width = '100%';
                const indicationsData = row['Indications_Data'];
                indicationsData.forEach((indicationObj) => {
                    const indDiv = document.createElement('div');
                    let color = '';
                    const rem = (indicationObj.remboursement || '').toLowerCase();
                        if (rem === 'amm') color = '#43b581';
                        if (rem === 'hors amm') color = '#e74c3c';
                    if (rem === 'amm non remboursé') color = '#a259d9';
                    if (rem === 'rtu') color = '#ff7043';
                        if (rem === 'groupe 3') color = '#5c6bc0';
                        if (rem === 'liste en sus') color = '#fbc02d';
                    if (color) {
                        indDiv.style.background = color;
                        indDiv.style.borderRadius = '6px';
                        indDiv.style.padding = '2px 8px';
                        indDiv.style.marginBottom = '2px';
                        indDiv.style.color = (color === '#ffe082') ? '#000' : '#fff';
                        indDiv.style.width = '100%';
                        indDiv.style.boxSizing = 'border-box';
                    }
                    // Texte indication + remboursement
                    let indicationText = indicationObj.indication ? indicationObj.indication.trim() : '';
                    if (rem) indicationText += ' (' + indicationObj.remboursement + ')';
                    const indicationContainer = document.createElement('span');
                    indicationContainer.textContent = indicationText;
                    // Bouton posologie si dispo
                    if (indicationObj.posologie && indicationObj.posologie.trim() !== '') {
                        const posologieBtn = document.createElement('button');
                        posologieBtn.textContent = 'Poso';
                        posologieBtn.className = 'posologie-btn action-btn';
                        posologieBtn.title = 'Voir la posologie';
                        posologieBtn.onclick = (e) => {
                            e.stopPropagation();
                            const posologieBody = document.getElementById('posologie-body');
                            const posologieModal = document.getElementById('posologie-modal');
                            posologieBody.innerHTML = '';
                            const indicationDiv = document.createElement('div');
                            indicationDiv.style.fontWeight = 'bold';
                            indicationDiv.style.marginBottom = '10px';
                            indicationDiv.style.color = '#333';
                            indicationDiv.textContent = indicationObj.indication;
                            posologieBody.appendChild(indicationDiv);
                            const posologieDiv = document.createElement('div');
                            posologieDiv.innerHTML = indicationObj.posologie.replace(/\n/g, '<br>');
                            posologieBody.appendChild(posologieDiv);
                            posologieModal.classList.remove('hidden');
                        };
                        indicationContainer.appendChild(posologieBtn);
                    }
                    indDiv.appendChild(indicationContainer);
                    indicationsBlock.appendChild(indDiv);
                });
                td.appendChild(indicationsBlock);
            } else if (h === 'Surveillance' && val.trim() !== '') {
                // Affichage multi-lignes façon pastilles, découpe sur les puces ou retours à la ligne, sans doublons
                let surveillances = val.includes('•') ? val.split(/\n|\r|•/).map(x => x.trim()).filter(Boolean) : val.split(/\n|\r/).map(x => x.trim()).filter(Boolean);
                surveillances = Array.from(new Set(surveillances)); // suppression des doublons
                const survBlock = document.createElement('div');
                survBlock.style.width = '100%';
                surveillances.forEach(surv => {
                    const survDiv = document.createElement('div');
                    survDiv.style.background = '#90caf9'; // bleu pastel
                    survDiv.style.borderRadius = '6px';
                    survDiv.style.padding = '2px 8px';
                    survDiv.style.marginBottom = '2px';
                    survDiv.style.color = '#1a2330';
                    survDiv.style.width = '100%';
                    survDiv.style.boxSizing = 'border-box';
                    survDiv.textContent = surv;
                    survBlock.appendChild(survDiv);
                });
                td.appendChild(survBlock);
            } else if (h !== 'Surveillance') {
                // Sinon, on gère les retours à la ligne simples
                td.innerHTML = val.replace(/\n/g, '<br>');
            }

            if (h === 'DCI') {
                td.style.textAlign = 'center';
                td.style.verticalAlign = 'middle';
                // Surlignage selon la famille de molécule
                const famille = row['Famille de molécule'] ? row['Famille de molécule'].toLowerCase() : '';
                if (famille === 'hors taa') {
                    td.style.background = '#8d6e63';
                    td.style.color = '#fff';
                } else if (famille === 'anti infectieux') {
                    td.style.background = '#00bcd4';
                    td.style.color = '#fff';
                }
                // Le nom de la DCI est déjà dans le td.innerHTML
                // On crée un conteneur pour les boutons en dessous
                const btnContainer = document.createElement('div');
                btnContainer.className = 'btn-container';
                btnContainer.style.marginTop = '10px';

                // Ajout du bouton 'Produits' si des détails existent
                const detailsProduit = row['Détails produit'];
                const fiche = row['Fiche'];
                if (detailsProduit && detailsProduit.trim() !== '') {
                    const productBtn = document.createElement('button');
                    productBtn.textContent = 'Produits';
                    productBtn.className = 'product-btn action-btn';
                    productBtn.onclick = () => {
                        const productBody = document.getElementById('product-body');
                        const productModal = document.getElementById('product-modal');
                        productBody.innerHTML = '';
                        // On retire uniquement le contenu exact de la fiche du détail produit
                        let produits = detailsProduit;
                        if (fiche && fiche.trim() !== '') {
                            // On retire la fiche si elle est présente dans le détail produit
                            produits = produits.replace(fiche, '');
                        }
                        produits.split(/\n\n|\r\n\r\n/).forEach(prod => {
                            const lines = prod.split(/\n|\r\n/);
                            lines.forEach((line) => {
                                // On ignore toute ligne qui commence par '• Fiche :' (avec ou sans espaces)
                                if (/^•?\s*Fiche\s*:/i.test(line.trim())) return;
                                const div = document.createElement('div');
                                if (/^\s*Produit \d+\s*:/i.test(line)) {
                                    div.textContent = line.trim();
                                    div.style.background = '#f0f0f0';
                                    div.style.fontWeight = 'bold';
                                    div.style.padding = '2px 8px';
                                    div.style.margin = '6px 0 2px 0';
                                    div.style.borderRadius = '6px';
                                } else if (line.trim().startsWith('•')) {
                                    div.textContent = line.trim();
                                    div.style.marginLeft = '18px';
                                } else {
                                    div.textContent = line.trim();
                                }
                                if (div.textContent.trim() !== '') productBody.appendChild(div);
                            });
                        });
                        productModal.classList.remove('hidden');
                    };
                    btnContainer.appendChild(productBtn);
                }
                
                // Ajout du bouton 'Fiche' si une fiche existe
                if (fiche && fiche.trim() !== '') {
                    const ficheBtn = document.createElement('button');
                    ficheBtn.textContent = 'Fiche';
                    ficheBtn.className = 'fiche-btn action-btn';
                    ficheBtn.onclick = () => {
                        const ficheBody = document.getElementById('fiche-body');
                        const ficheModal = document.getElementById('fiche-modal');
                        // On transforme les liens en hyperliens cliquables
                        let ficheHtml = fiche
                            // Liens web d'abord
                            .replace(/(https?:\/\/[^\s"']+)/gi, '<a href="$1" target="_blank">$1</a>')
                            // Chemins UNC réseau (\\serveur\... ou //serveur/...) qui ne sont pas déjà dans un lien web
                            .replace(/(^|[^\w:>])((?:\\\\|\/\/)[^\s"']+)/g, function(match, p1, p2) {
                                // On ne transforme pas si précédé de http(s):
                                if (/https?:$/.test(p1)) return match;
                                return p1 + `<a href="file:///${p2.replace(/\\/g, '/')}" target="_blank">${p2}</a>`;
                            })
                            // Chemins locaux de type X:\... ou X:/...
                            .replace(/\b([A-Z]:[\\/][^\s"']+)/gi, function(match) {
                                return `<a href="file:///${match.replace(/\\/g, '/')}" target="_blank">${match}</a>`;
                        });
                        ficheBody.innerHTML = ficheHtml.replace(/\n/g, '<br>');
                        ficheModal.classList.remove('hidden');
                    };
                    btnContainer.appendChild(ficheBtn);
                }

                if (btnContainer.hasChildNodes()) {
                    td.appendChild(btnContainer);
                }
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
    // Ajout de la date de mise à jour
    majContainer.innerHTML = `<b>Dernière mise à jour du tableau :</b> ${updateDate}`;
    container.appendChild(majContainer);
}