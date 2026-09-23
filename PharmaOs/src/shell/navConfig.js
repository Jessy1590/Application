import {
  PhoneCall, Calendar, CheckSquare, Activity, BookOpen, ShieldAlert,
  FileText, AlertOctagon, Package, PackageX, BedDouble, Scale, FlaskConical, Droplets,
  Wallet, Users, LayoutDashboard, Pill, MessageCircle, Inbox, Pencil, User,
  ClipboardList, PlusCircle, RefreshCw, Lock, Phone, Receipt, Warehouse, ScanText, Settings,
  ScrollText, Bug, Shield,
} from 'lucide-react';

/** Aligné sur les sous-groupes de la Taskbar — sections scannables, peu denses. */
export const NAV_SECTIONS = [
  {
    title: 'Accueil',
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Quotidien',
    items: [
      { id: 'inbox', label: 'À traiter', icon: Inbox, color: 'indigo' },
      { id: 'inbox_saisies', label: 'Mes saisies', icon: Pencil, color: 'indigo' },
      { id: 'tasks', label: 'Mes tâches', icon: CheckSquare, color: 'orange' },
      { id: 'agenda', label: 'Agenda', icon: Calendar, color: 'purple' },
    ],
  },
  {
    title: 'Communication',
    items: [
      { id: 'calls', label: 'Appels', icon: PhoneCall, color: 'emerald' },
      { id: 'directory', label: 'Annuaire', icon: BookOpen, color: 'blue' },
      { id: 'ip', label: 'Act-IP', icon: Activity, color: 'sky' },
    ],
  },
  {
    title: 'Qualité',
    items: [
      { id: 'documents', label: 'GED', icon: FileText, color: 'indigo' },
      { id: 'quality', label: 'Qualité', icon: ShieldAlert, color: 'rose' },
      { id: 'retrait_lot', label: 'Retrait lot', icon: AlertOctagon, color: 'red' },
    ],
  },
  {
    title: 'Stock',
    items: [
      { id: 'perimes', label: 'Périmés', icon: Package, color: 'orange' },
      { id: 'stock', label: 'Stock', icon: PackageX, color: 'violet' },
      { id: 'disputes', label: 'Litiges', icon: Scale, color: 'amber' },
    ],
  },
  {
    title: 'Métier',
    items: [
      { id: 'psl', label: 'MDS', icon: Droplets, color: 'rose' },
      { id: 'stupefiants', label: 'Stupéfiants', icon: Lock, color: 'rose' },
      { id: 'conseil', label: 'Conseil', icon: MessageCircle, color: 'rose' },
      { id: 'bdm', label: 'BDPM', icon: Pill, color: 'teal' },
    ],
  },
  /**
   * Sous-groupe Préparations (magistrales) — un onglet par écran.
   * Visibilité : feature dashboard `magistral` (matrice Accès & rôles).
   */
  {
    title: 'Préparations',
    items: [
      { id: 'magistral_suivi', label: 'Suivi', icon: ClipboardList, color: 'fuchsia' },
      { id: 'magistral_creation', label: 'Création', icon: PlusCircle, color: 'fuchsia' },
      { id: 'magistral_devis', label: 'Devis', icon: Receipt, color: 'fuchsia' },
      { id: 'magistral_rappel', label: 'Rappel', icon: Phone, color: 'fuchsia' },
      { id: 'magistral_dispenser', label: 'Dispenser', icon: Package, color: 'fuchsia' },
      { id: 'magistral_renouvellement', label: 'Renouvellement', icon: RefreshCw, color: 'fuchsia' },
    ],
  },
  /**
   * Sous-groupe Location — un onglet par écran métier.
   * Visibilité : feature dashboard `location` (matrice Accès & rôles).
   */
  {
    title: 'Location',
    items: [
      { id: 'location_suivi', label: 'Suivi', icon: ClipboardList, color: 'cyan' },
      { id: 'location_creation', label: 'Création', icon: PlusCircle, color: 'cyan' },
      { id: 'location_prolongation', label: 'Prolongation', icon: RefreshCw, color: 'cyan' },
      { id: 'location_cloture', label: 'Clôture', icon: Lock, color: 'cyan' },
      { id: 'location_contact', label: 'Contact', icon: Phone, color: 'cyan' },
      { id: 'location_facture', label: 'Facture', icon: Receipt, color: 'cyan' },
      { id: 'location_parc', label: 'Parc', icon: Warehouse, color: 'cyan' },
      { id: 'location_transcription', label: 'Transcription', icon: ScanText, color: 'cyan' },
    ],
  },
  {
    title: 'RH / Compta',
    items: [
      { id: 'hr', label: 'RH', icon: Users, color: 'indigo' },
      { id: 'cash', label: 'Caisse', icon: Wallet, color: 'emerald' },
    ],
  },
  {
    title: 'Compte',
    items: [
      { id: 'account', label: 'Mon compte', icon: User, color: 'slate' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { id: 'logs', label: 'Logs', icon: ScrollText, color: 'slate' },
      { id: 'bugs', label: 'Bugs', icon: Bug, color: 'rose' },
      { id: 'access', label: 'Accès & rôles', icon: Shield, color: 'indigo' },
      { id: 'parametres', label: 'Paramètres', icon: Settings, color: 'slate' },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

/** Alias legacy : ancien onglet unique Location / Magistrales → Suivi ; paramètres module → admin. */
export function resolveNavPageId(pageId) {
  if (pageId === 'location') return 'location_suivi';
  if (pageId === 'magistral') return 'magistral_suivi';
  if (pageId === 'location_parametres' || pageId === 'magistral_parametres') return 'parametres';
  return pageId;
}

/** Sous-onglet Paramètres à ouvrir depuis un id legacy ou un payload. */
export function settingsTabFromNav(pageId, pageData = null) {
  if (pageData?.tab || pageData?.settingsTab) {
    return pageData.tab || pageData.settingsTab;
  }
  if (pageId === 'location_parametres') return 'location';
  if (pageId === 'magistral_parametres') return 'preparations';
  return null;
}

export function findNavItem(pageId) {
  const id = resolveNavPageId(pageId);
  return ALL_NAV_ITEMS.find((i) => i.id === id) || null;
}

/** Icônes section (rétrocompat imports). */
export { BedDouble, FlaskConical };
