import { supabase } from './supabaseClient.js';

export const QUALITY_TYPES = [
  { value: 'erreur_delivrance', label: 'Erreur de délivrance' },
  { value: 'presqu_erreur', label: 'Presqu\'erreur' },
  { value: 'reclamation_patient', label: 'Réclamation patient' },
  { value: 'probleme_fournisseur', label: 'Problème fournisseur' },
];

export const SEVERITY_LEVELS = [
  { value: 'mineure', label: 'Mineure' },
  { value: 'majeure', label: 'Majeure' },
  { value: 'critique', label: 'Critique' },
];

export async function insertQualityEvent(userId, payload) {
  const { type, description, severity, immediateAction, location, medicament } = payload;
  return supabase.from('quality_events').insert({
    user_id: userId,
    type,
    status: 'ouvert',
    severity: severity || 'mineure',
    data: {
      description,
      immediate_action: immediateAction || '',
      location: location || '',
      medicament: medicament || '',
    },
  });
}

export async function fetchMyQualityEvents(userId, limit = 10) {
  return supabase
    .from('quality_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
}
