/**
 * Charge les modules UI Location PhieEvreux (IIFE → window.Location*).
 */
import { ensureLocationGlobals } from '../services/locationGlobals.js';
import { LocationAccessApi } from '../services/locationAccess.js';
import './fields.js';
import './cloture.js';
import './creation.js';
import './suivi.js';
import './contact.js';
import './prolongation.js';
import './facture.js';
import './parc.js';
import './admin-location.js';
import './transcription-ocr.js';
import './transcription.js';

ensureLocationGlobals();
if (typeof window !== 'undefined') {
  window.LocationAccess = LocationAccessApi;
}

export const MODULE_TITLES = {
  creation: 'Création',
  transcription: 'Transcription',
  suivi: 'Suivi',
  contact: 'Contact',
  facture: 'Facture',
  parc: 'Parc',
  prolongation: 'Prolongation',
  cloture: 'Clôture',
  parametres: 'Paramètres',
};

export async function mountLocationModule(name, root, ctx) {
  const g = window;
  if (name === 'creation') await g.LocationCreation.mount(root, ctx);
  else if (name === 'transcription') await g.LocationTranscription.mount(root, ctx);
  else if (name === 'suivi') await g.LocationSuivi.mount(root, ctx);
  else if (name === 'contact') await g.LocationContact.mount(root, ctx);
  else if (name === 'facture') await g.LocationFacture.mount(root, ctx);
  else if (name === 'parc') await g.LocationParc.mount(root, ctx);
  else if (name === 'prolongation') await g.LocationProlongation.mount(root, ctx);
  else if (name === 'cloture') await g.LocationCloture.mount(root, ctx);
  else if (name === 'parametres') {
    await g.LocationAdmin.mount(root, {
      userId: ctx.userId,
      isAdmin: ctx.isAdmin,
      isGestionnaire: ctx.isGestionnaire,
      canAccessParams: true,
      role: ctx.role,
      matrix: ctx.matrix,
    });
  } else {
    root.innerHTML = '<p class="loc-msg loc-msg-err">Module inconnu.</p>';
  }
}
