import {
  PhoneCall, Calendar, CheckSquare, Activity, BookOpen, ShieldAlert,
  FileText, AlertOctagon, Package, PackageX, BedDouble, Scale, FlaskConical, Droplets,
  Wallet, Users, LayoutDashboard,
} from 'lucide-react';

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
      { id: 'rental', label: 'Location', icon: BedDouble, color: 'cyan' },
      { id: 'magistral', label: 'Magistrales', icon: FlaskConical, color: 'fuchsia' },
      { id: 'psl', label: 'MDS', icon: Droplets, color: 'rose' },
      { id: 'cash', label: 'Caisse', icon: Wallet, color: 'emerald' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { id: 'ip', label: 'Act-IP', icon: Activity, color: 'sky' },
      { id: 'directory', label: 'Annuaire', icon: BookOpen, color: 'blue' },
      { id: 'hr', label: 'RH', icon: Users, color: 'indigo' },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);
