/**
 * Éditeur texte riche léger (contenteditable + barre d’outils).
 */
(function (global) {
  const CMDS = [
    { cmd: 'bold', label: 'B', title: 'Gras' },
    { cmd: 'italic', label: 'I', title: 'Italique' },
    { cmd: 'underline', label: 'U', title: 'Souligné' },
    { cmd: 'insertUnorderedList', label: '•', title: 'Liste' },
    { cmd: 'insertOrderedList', label: '1.', title: 'Liste numérotée' },
    { cmd: 'formatBlock', arg: 'h2', label: 'H2', title: 'Titre' },
    { cmd: 'formatBlock', arg: 'h3', label: 'H3', title: 'Sous-titre' },
    { cmd: 'formatBlock', arg: 'p', label: '¶', title: 'Paragraphe' },
    { cmd: 'removeFormat', label: 'Tx', title: 'Effacer format' },
  ];

  function mount(host, initialHtml) {
    host.innerHTML = '';
    host.classList.add('jp-rte');
    const bar = document.createElement('div');
    bar.className = 'jp-rte-bar';
    const surface = document.createElement('div');
    surface.className = 'jp-rte-surface';
    surface.contentEditable = 'true';
    surface.setAttribute('role', 'textbox');
    surface.setAttribute('aria-multiline', 'true');
    surface.innerHTML = initialHtml || '<p><br></p>';

    CMDS.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'jp-rte-btn';
      btn.textContent = c.label;
      btn.title = c.title;
      if (c.cmd === 'italic') btn.style.fontStyle = 'italic';
      if (c.cmd === 'bold') btn.style.fontWeight = '700';
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        surface.focus();
        if (c.arg) document.execCommand(c.cmd, false, c.arg);
        else document.execCommand(c.cmd, false, null);
      });
      bar.appendChild(btn);
    });

    const linkBtn = document.createElement('button');
    linkBtn.type = 'button';
    linkBtn.className = 'jp-rte-btn';
    linkBtn.textContent = '🔗';
    linkBtn.title = 'Lien';
    linkBtn.addEventListener('mousedown', (e) => e.preventDefault());
    linkBtn.addEventListener('click', () => {
      const url = prompt('URL du lien');
      if (!url) return;
      surface.focus();
      document.execCommand('createLink', false, url);
    });
    bar.appendChild(linkBtn);

    host.appendChild(bar);
    host.appendChild(surface);

    return {
      getHtml() {
        return surface.innerHTML;
      },
      setHtml(html) {
        surface.innerHTML = html || '<p><br></p>';
      },
      el: surface,
      destroy() {
        host.innerHTML = '';
        host.classList.remove('jp-rte');
      },
    };
  }

  global.JpStudioRichtext = { mount };
})(window);
