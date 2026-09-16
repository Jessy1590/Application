/**
 * Champs multi-valeurs (téléphones / mails) — même logique qu’Ancienne Location.
 */
(function (global) {
  function collect(listEl, inputSel) {
    if (!listEl) return [];
    return [...listEl.querySelectorAll(inputSel)]
      .map((i) => i.value.trim())
      .filter(Boolean);
  }

  function addRow(listEl, { type, className, placeholder, value }) {
    const row = document.createElement('div');
    row.className = 'loc-multi-row';
    const input = document.createElement('input');
    input.type = type;
    input.className = className;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.value = value || '';
    if (type === 'tel') input.inputMode = 'tel';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'loc-icon-btn loc-multi-remove';
    remove.setAttribute('aria-label', 'Retirer');
    remove.textContent = '✕';
    remove.addEventListener('click', (e) => {
      e.preventDefault();
      row.remove();
      if (!listEl.children.length) addRow(listEl, { type, className, placeholder, value: '' });
    });
    row.append(input, remove);
    listEl.appendChild(row);
    return input;
  }

  function reset(listEl, values, opts) {
    listEl.innerHTML = '';
    const vals = values?.length ? values : [''];
    vals.forEach((v) => addRow(listEl, { ...opts, value: v }));
  }

  function bindAdd(btn, listEl, opts) {
    btn?.addEventListener('click', (e) => {
      e.preventDefault();
      const input = addRow(listEl, { ...opts, value: '' });
      input.focus();
    });
  }

  function mountPhones(listEl, addBtn, values) {
    const opts = { type: 'tel', className: 'loc-multi-input phone-input', placeholder: '06 12 34 56 78' };
    reset(listEl, values, opts);
    bindAdd(addBtn, listEl, opts);
  }

  function mountMails(listEl, addBtn, values) {
    const opts = { type: 'email', className: 'loc-multi-input mail-input', placeholder: 'exemple@mail.fr' };
    reset(listEl, values, opts);
    bindAdd(addBtn, listEl, opts);
  }

  function collectPhones(listEl) {
    return collect(listEl, '.phone-input');
  }

  function collectMails(listEl) {
    return collect(listEl, '.mail-input');
  }

  function blockHtml(kind, title) {
    const listId = kind === 'phones' ? 'phonesList' : 'mailsList';
    const btnId = kind === 'phones' ? 'addPhoneBtn' : 'addMailBtn';
    return `<div class="loc-multi-block" data-multi="${kind}">
      <div class="loc-multi-head">
        <span>${title}</span>
        <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" id="${btnId}">＋ Ajouter</button>
      </div>
      <div id="${listId}" class="loc-multi-list"></div>
    </div>`;
  }

  global.LocationFields = {
    mountPhones,
    mountMails,
    collectPhones,
    collectMails,
    blockHtml,
  };
})(window);
