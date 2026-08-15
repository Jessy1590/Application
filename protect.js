// Fichier : protect.js

(async function() {
  // 1. Vérification que la configuration a bien été mise dans le HTML
  if (typeof CONFIG_SITE_ID === 'undefined' || typeof CONFIG_PORTAIL_URL === 'undefined') {
    console.error("Erreur: CONFIG_SITE_ID ou CONFIG_PORTAIL_URL manquant.");
    return;
  }

  // Vos clés (restent identiques pour tous les sites)
  const SUPABASE_URL = "https://kpjflntnotftpzffjbud.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwamZsbnRub3RmdHB6ZmZqYnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODg0MjMsImV4cCI6MjEwMTg2NDQyM30.mTjm86Thn6VUOAAJRWCsGMcR0Ip-qEP08fJdwUvKKEo";

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: 'portail' }
  });

  // Fonctions pour gérer le résultat
  function autoriserAcces() {
    // La personne a le droit : on affiche le site
    if (document.body) document.body.style.display = 'block';
  }

  function refuserAcces() {
    // La personne n'a pas le droit : on la renvoie sur le portail
    window.location.replace(CONFIG_PORTAIL_URL);
  }

  try {
    // Étape A : Connecté ?
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) return refuserAcces();

    // Étape B : Admin ?
    const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
    if (profile && profile.role === 'admin') return autoriserAcces();

    // Étape C : Accès spécifique au site ?
    const { data: access, error: accessError } = await sb.from('site_access')
      .select('site_id').eq('user_id', user.id).eq('site_id', CONFIG_SITE_ID).single();

    if (accessError || !access) return refuserAcces();
    
    // Si toutes les vérifications passent
    autoriserAcces();

  } catch (err) {
    console.error("Erreur de vérification :", err);
    refuserAcces();
  }
})();