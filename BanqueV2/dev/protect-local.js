// Remplaçant LOCAL de ../protect.js (servi uniquement par dev/serve.py).
// En ligne, le vrai portail reste obligatoire.
async function initialiserSite() {
  const cfg = window.SUPABASE_CONFIG || {};
  const sb = supabase.createClient(cfg.url, cfg.anonKey);
  const whenReady = (fn) => document.body ? fn() : document.addEventListener('DOMContentLoaded', fn);
  const { data } = await sb.auth.getSession();
  if (data && data.session) return whenReady(() => { document.body.style.display = 'block'; });

  const render = () => {
    document.body.style.display = 'block';
    const box = document.createElement('div');
    box.id = 'dev-login';
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#f4f1ea;font-family:system-ui,sans-serif;';
    box.innerHTML = `
      <form style="background:#fff;padding:24px;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.12);width:min(340px,90vw);display:flex;flex-direction:column;gap:10px;">
        <strong>Connexion locale (test V2)</strong>
        <small style="color:#777">Même compte que le portail. Uniquement sur localhost.</small>
        <input name="email" type="email" placeholder="E-mail" required autocomplete="username" style="padding:10px;border:1px solid #ccc;border-radius:8px;">
        <input name="password" type="password" placeholder="Mot de passe" required autocomplete="current-password" style="padding:10px;border:1px solid #ccc;border-radius:8px;">
        <button style="padding:10px;border:0;border-radius:8px;background:#5f7d5c;color:#fff;font-weight:600;">Se connecter</button>
        <small class="err" style="color:#b44"></small>
      </form>`;
    document.body.appendChild(box);
    box.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      if (error) { f.querySelector('.err').textContent = error.message; return; }
      location.reload();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
}
