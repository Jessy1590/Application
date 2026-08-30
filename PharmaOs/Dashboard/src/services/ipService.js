import { supabase } from './supabaseClient';

export const fetchIps = async () => {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('act_ip_logs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Erreur récupération IP:", error);
    throw error;
  }
  return data;
};

export const updateIp = async (id, updates) => {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('act_ip_logs')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) {
    console.error("Erreur lors de la mise à jour de l'IP:", error);
    throw error;
  }
  return data;
};

export const fetchIpsWithProfiles = async () => {
  // 1. Récupération des IP
  const { data: ips, error: ipError } = await supabase
    .schema('PharmaOs')
    .from('act_ip_logs')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (ipError) throw ipError;

  // 2. Récupération des profils autorisés (admin & équipe)
  const { data: profiles, error: profError } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id, display_name, role')
    .in('role', ['admin', 'équipe']);
    
  if (profError) throw profError;

  // 3. Fusion des données
  return ips.map(ip => ({
    ...ip,
    profile: profiles.find(p => p.id === ip.user_id) || { display_name: 'Inconnu' }
  }));
};