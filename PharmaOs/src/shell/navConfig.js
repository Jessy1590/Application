import {
  PhoneCall, Calendar, CheckSquare, Activity, BookOpen, ShieldAlert,
  FileText, AlertOctagon, Package, PackageX, BedDouble, Scale, FlaskConical, Droplets,
  Wallet, Users, LayoutDashboard, Pill, MessageCircle,
  ClipboardList, PlusCircle, RefreshCw, Lock, Phone, Receipt, Warehouse, ScanText, Settings,
  ScrollText, Bug, Shield,
} from 'lucide-react';

/** Aligné sur les sous-groupes de la Taskbar. */
export const NAV_SECTIONS = [
  {
    title: 'Principal',
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { id: 'calls', label: 'Appels', icon: PhoneCall, color: 'emerald' },
      { id: 'agenda', label: 'Agenda', icon: Calendar, color: 'purple' },
      { id: 'tasks', label: 'Tâches', icon: CheckSquare, color: 'orange' },
    ],
  },
  {
    title: 'Communication',
    items: [
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
      { id: 'magistral', label: 'Magistrales', icon: FlaskConical, color: 'fuchsia' },
      { id: 'psl', label: 'MDS', icon: Droplets, color: 'rose' },
      { id: 'conseil', label: 'Conseil', icon: MessageCircle, color: 'rose' },
      { id: 'bdm', label: 'BDPM', icon: Pill, color: 'teal' },
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
      { id: 'location_parametres', label: 'Paramètres', icon: Settings, color: 'cyan' },
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
    title: 'Administration',
    items: [
      { id: 'logs', label: 'Logs', icon: ScrollText, color: 'slate' },
      { id: 'bugs', label: 'Bugs', icon: Bug, color: 'rose' },
      { id: 'access', label: 'Accès & rôles', icon: Shield, color: 'indigo' },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

/** Alias legacy : ancien onglet unique « Location » → Suivi. */
export function resolveNavPageId(pageId) {
  if (pageId === 'location') return 'location_suivi';
  return pageId;
}

export function findNavItem(pageId) {
  const id = resolveNavPageId(pageId);
  return ALL_NAV_ITEMS.find((i) => i.id === id) || null;
}

/** Icône section Location (rétrocompat imports). */
export { BedDouble };
