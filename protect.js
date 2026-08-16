// Définition de l'URL de votre portail
const URL_PORTAIL = "https://jessy1590.github.io/Application";

/**
 * Fonction principale appelée depuis vos fichiers HTML
 * @param {string} siteId - L'identifiant ou le nom du site
 */
async function initialiserSite(siteId) {
  // 1. On lance la vérification de sécurité
  await verifierSecurite(siteId);

  // 2. On ajoute le bouton flottant dès que la page est prête
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ajouterBoutonRetour);
  } else {
    ajouterBoutonRetour();
  }
}

/**
 * Votre système de protection Supabase
 */
async function verifierSecurite(siteId) {
  if (!siteId) {
    console.error("Erreur: L'ID ou le nom du site n'a pas été fourni.");
    return refuserAcces();
  }

  // Vos clés Supabase
  const SUPABASE_URL = "https://kpjflntnotftpzffjbud.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwamZsbnRub3RmdHB6ZmZqYnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODg0MjMsImV4cCI6MjEwMTg2NDQyM30.mTjm86Thn6VUOAAJRWCsGMcR0Ip-qEP08fJdwUvKKEo";

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: 'portail' }
  });

  function autoriserAcces() {
    if (document.body) document.body.style.display = 'block';
  }

  function refuserAcces() {
    window.location.replace(URL_PORTAIL);
  }

  try {
    // Étape A : L'utilisateur est-il connecté ?
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) return refuserAcces();

    // Étape B : L'utilisateur est-il Admin ?
    const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
    if (profile && profile.role === 'admin') return autoriserAcces();

    // Étape C : L'utilisateur a-t-il un accès spécifique à ce site ?
    const { data: access, error: accessError } = await sb.from('site_access')
      .select('site_id').eq('user_id', user.id).eq('site_id', siteId).single();

    if (accessError || !access) return refuserAcces();
    
    // Si tout est bon
    autoriserAcces();

  } catch (err) {
    console.error("Erreur de vérification :", err);
    refuserAcces();
  }
}

/**
 * Création et affichage du bouton flottant
 */
function ajouterBoutonRetour() {
  const homeBtn = document.createElement('a');
  homeBtn.href = URL_PORTAIL;
  homeBtn.title = 'Retour au portail';

  // Icône SVG de maison
  homeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>';

  // Style du bouton
  Object.assign(homeBtn.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '56px',
    height: '56px',
    backgroundColor: '#2c3e50',
    color: '#ffffff',
    borderRadius: '50%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.3)',
    cursor: 'pointer',
    zIndex: '9999',
    transition: 'transform 0.2s ease, background-color 0.2s ease'
  });

  // Animation au survol
  homeBtn.addEventListener('mouseenter', () => {
    homeBtn.style.transform = 'scale(1.1)';
    homeBtn.style.backgroundColor = '#1a252f';
  });
  
  homeBtn.addEventListener('mouseleave', () => {
    homeBtn.style.transform = 'scale(1)';
    homeBtn.style.backgroundColor = '#2c3e50';
  });

  document.body.appendChild(homeBtn);
}