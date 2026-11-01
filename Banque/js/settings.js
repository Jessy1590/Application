Object.assign(BH, {
    // --- SAUVEGARDE / RESTAURATION ---
    downloadBackup() {
      const backup = {
        app: 'Budget Partagé',
        backup_version: 1,
        exported_at: new Date().toISOString(),
        exported_by: this.user?.id || null,
        accounts: this.state.accounts,
        account_members: this.state.members.map(({ profiles, ...m }) => m), // on retire la jointure, on garde les colonnes brutes
        expenses: this.state.expenses,
        incomes: this.state.incomes,
        month_records: this.state.monthRecords,
        profile: this.state.profile
      };
      const filename = `budget_partage_backup_${this.monthKey(new Date())}_${new Date().toISOString().slice(0,10)}.json`;
      this.downloadFile(filename, JSON.stringify(backup, null, 2), 'application/json');
      localStorage.setItem('bh_last_backup', new Date().toISOString());
      const infoEl = document.getElementById('bh-last-backup-info');
      if (infoEl) infoEl.textContent = `Dernière sauvegarde : ${new Date().toLocaleString('fr-FR')}`;
      toast('Sauvegarde téléchargée');
    },

    async restoreBackup(file) {
      if (!file) return;
      let backup;
      try {
        backup = JSON.parse(await file.text());
      } catch (e) {
        toast('Fichier invalide : ce n\'est pas un JSON de sauvegarde valide.');
        return;
      }
      if (!backup || !Array.isArray(backup.accounts)) {
        toast('Ce fichier ne ressemble pas à une sauvegarde de cette application.');
        return;
      }
      const dateStr = backup.exported_at ? new Date(backup.exported_at).toLocaleString('fr-FR') : 'date inconnue';
      const ok = confirm(
        `Restaurer la sauvegarde du ${dateStr} ?\n\n` +
        `Cela va réécrire les comptes, dépenses, revenus et historique de paiements présents dans ce fichier ` +
        `(les données correspondantes seront écrasées si elles existent déjà). Rien d'autre ne sera supprimé.\n\n` +
        `Continuer ?`
      );
      if (!ok) { document.getElementById('bh-restore-input').value = ''; return; }

      // Sauvegardes V1 : colonnes parfois nulles là où banque impose une valeur
      const accounts = (backup.accounts || []).map(a => ({ ...a, hide_deposit: !!a.hide_deposit }));
      const expenses = (backup.expenses || []).map(e => ({ ...e, is_wallet: !!e.is_wallet, active: e.active !== false }));

      await withRetry(async () => {
        let error;
        if (accounts.length) {
          ({ error } = await supabaseApp.from('accounts').upsert(accounts, { onConflict: 'id' }));
          if (error) throw error;
        }
        if (backup.account_members?.length) {
          ({ error } = await supabaseApp.from('account_members').upsert(backup.account_members, { onConflict: 'account_id,user_id' }));
          if (error) throw error;
        }
        if (expenses.length) {
          ({ error } = await supabaseApp.from('expenses').upsert(expenses, { onConflict: 'id' }));
          if (error) throw error;
        }
        if (backup.incomes?.length) {
          ({ error } = await supabaseApp.from('incomes').upsert(backup.incomes, { onConflict: 'id' }));
          if (error) throw error;
        }
        if (backup.month_records?.length) {
          await this.fetchData();
          await this.restoreMonthRecords(backup.month_records);
        }
        toast('Sauvegarde restaurée avec succès');
        document.getElementById('bh-restore-input').value = '';
        this.closeSettings();
        this.fetchData();
      }, 'restauration de la sauvegarde');
    },

    openSettings() {
      // Refléter l'état des notifications
      if ('Notification' in window && Notification.permission === 'granted') {
         document.getElementById('bh-notif-btn').textContent = '✅ Rappels activés';
      }
      // Remplir liste compte principal
      const sel = document.getElementById('setting-main-account');
      sel.innerHTML = `<option value="">-- Aucun --</option>` + 
         this.state.accounts.map(a => `<option value="${a.id}" ${this.state.profile.main_account_id === a.id ? 'selected':''}>${this.esc(a.name)}</option>`).join('');

      // Remplir liste codes de partage
      document.getElementById('settings-accounts-list').innerHTML = this.state.accounts.map(a => `
         <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line-soft); padding:8px 0; gap:8px;">
            <div style="font-weight:600; font-size:14px;">${this.esc(a.name)}</div>
            <div style="display:flex; align-items:center; gap:6px;">
              <div style="font-size:11px; background:var(--line-soft); padding:4px 8px; border-radius:6px; font-family:monospace; user-select:all;">${a.id}</div>
              <button class="bh-delete-acct-btn" onclick="BH.deleteAccount('${a.id}', '${this.esc(a.name).replace(/'/g, "\\'")}')" title="Supprimer ce compte">🗑</button>
            </div>
         </div>
      `).join('') + `<p style="font-size:11px; color:var(--ink-faint); margin-top:8px;">Copiez l'ID d'un compte ci-dessus et envoyez-le à un proche pour qu'il le rejoigne.</p>`;

      // Info dernière sauvegarde
      const lastBackup = localStorage.getItem('bh_last_backup');
      document.getElementById('bh-last-backup-info').textContent = lastBackup
        ? `Dernière sauvegarde : ${new Date(lastBackup).toLocaleString('fr-FR')}`
        : 'Aucune sauvegarde téléchargée pour le moment.';

      document.getElementById('bh-settings-overlay').classList.add('open');
    },

    closeSettings() { document.getElementById('bh-settings-overlay').classList.remove('open'); },

    async setMainAccount(id) {
       const { error } = await supabaseApp.from('profiles').update({ main_account_id: id || null }).eq('id', this.user.id);
       if(!error) { toast("Compte principal enregistré"); this.fetchData(); }
    },

    async createAccount() {
      const name = document.getElementById('create-account-name').value.trim();
      if(!name) { toast("Indiquez un nom de compte."); return; }

      // Validation : pas de doublon de nom de compte (insensible à la casse)
      const dup = this.state.accounts.some(a => a.name.trim().toLowerCase() === name.toLowerCase());
      if (dup) { toast("Un compte porte déjà ce nom."); return; }
      
      if (!await this.createAccountInline(name)) return;
      toast("Compte créé !");
      document.getElementById('create-account-name').value = '';
      this.fetchData();
      this.closeSettings();
    },

    async joinAccount() {
      const code = document.getElementById('join-code').value.trim();
      if(!code) { toast("Collez un code de compte."); return; }
      if (this.state.members.some(m => m.account_id === code && m.user_id === this.user.id)) {
        toast("Vous êtes déjà membre de ce compte."); return;
      }
      await withRetry(async () => {
        const { error } = await supabaseApp.from('account_members').insert([{ account_id: code, user_id: this.user.id, role: 'editor' }]);
        if(error) throw error;
        toast("Compte rejoint avec succès !"); this.fetchData(); this.closeSettings();
      }, 'ajout au compte');
    }
});
