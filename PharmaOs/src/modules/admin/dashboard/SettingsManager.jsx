import React, { useEffect, useMemo, useState } from 'react';
import { Settings, BedDouble, FlaskConical, Package, Wallet, Mail, Building2 } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import LocationManager from '../../location/dashboard/LocationManager.jsx';
import MagistralSettingsPanel from '../../magistral/dashboard/MagistralSettingsPanel.jsx';
import PerimesEmplacementsSettings from '../../perimes/dashboard/PerimesEmplacementsSettings.jsx';
import CashSettingsPanel from '../../cash/dashboard/CashSettingsPanel.jsx';
import MailTemplatesSettings from './MailTemplatesSettings.jsx';
import GeneralSettingsPanel from './GeneralSettingsPanel.jsx';
import { SETTINGS_TABS, resolveSettingsTab } from '../services/settingsNav.js';

const TAB_ICONS = {
  general: Building2,
  location: BedDouble,
  preparations: FlaskConical,
  perimes: Package,
  cash: Wallet,
  mails: Mail,
};

/**
 * Administration → Paramètres : sous-onglets par module.
 * @param {{ initialTab?: string, onNavigate?: Function, pageData?: object }} props
 */
export default function SettingsManager({
  initialTab = null,
  onNavigate = null,
  pageData = null,
}) {
  const { canAccess } = useAuth();

  const visibleTabs = useMemo(
    () => SETTINGS_TABS.filter((t) => canAccess('dashboard', t.feature)),
    [canAccess],
  );

  const requested = resolveSettingsTab(initialTab || pageData?.tab || pageData?.settingsTab);

  useEffect(() => {
    if (requested === 'directory_redirect' && typeof onNavigate === 'function') {
      onNavigate('directory');
    }
  }, [requested, onNavigate]);

  const [tab, setTab] = useState(() => {
    if (requested && requested !== 'directory_redirect' && visibleTabs.some((t) => t.id === requested)) {
      return requested;
    }
    return visibleTabs[0]?.id || null;
  });

  useEffect(() => {
    if (!visibleTabs.length) {
      setTab(null);
      return;
    }
    const next = resolveSettingsTab(initialTab || pageData?.tab || pageData?.settingsTab);
    if (next === 'directory_redirect') return;
    if (next && visibleTabs.some((t) => t.id === next)) {
      setTab(next);
      return;
    }
    setTab((current) => (visibleTabs.some((t) => t.id === current) ? current : visibleTabs[0].id));
  }, [visibleTabs, initialTab, pageData?.tab, pageData?.settingsTab]);

  if (!visibleTabs.length) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
          <Settings className="text-slate-600" /> Paramètres
        </h1>
        <p className="text-sm text-slate-500">
          Aucun module configurable n’est accessible avec votre profil.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
          <Settings className="text-slate-600" /> Paramètres
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Pharmacie (général), modules métier et templates mail.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-px">
        {visibleTabs.map((t) => {
          const Icon = TAB_ICONS[t.id] || Settings;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-t-lg border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-slate-800 text-slate-900 font-semibold bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === 'general' && <GeneralSettingsPanel onNavigate={onNavigate} />}
        {tab === 'location' && (
          <LocationManager view="parametres" onNavigate={onNavigate} pageData={pageData} />
        )}
        {tab === 'preparations' && <MagistralSettingsPanel />}
        {tab === 'perimes' && <PerimesEmplacementsSettings />}
        {tab === 'cash' && <CashSettingsPanel />}
        {tab === 'mails' && <MailTemplatesSettings />}
      </div>
    </div>
  );
}
