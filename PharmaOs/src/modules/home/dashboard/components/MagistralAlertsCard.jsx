import React, { useState, useEffect } from 'react';
import { FlaskConical } from 'lucide-react';
import StatCard from './StatCard.jsx';
import { countAlerts } from '../../../magistral/services/magistralService.js';

export default function MagistralAlertsCard({ onNavigate }) {
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    countAlerts().then(setAlerts).catch(console.error);
  }, []);

  if (!alerts) return null;

  const total = alerts.devis + alerts.a_controler + alerts.a_rappeler + alerts.a_dispenser;
  if (total === 0) {
    return (
      <StatCard
        title="Magistrales"
        icon={FlaskConical}
        onClick={() => onNavigate?.('magistral_suivi')}
        metrics={[{ label: 'À traiter', value: 0 }]}
        footnote="Aucun dossier en attente"
      />
    );
  }

  return (
    <StatCard
      title="Magistrales"
      icon={FlaskConical}
      onClick={() => onNavigate?.('magistral_suivi')}
      metrics={[
        { label: 'Devis', value: alerts.devis },
        { label: 'À contrôler', value: alerts.a_controler },
        { label: 'À rappeler', value: alerts.a_rappeler },
        { label: 'À dispenser', value: alerts.a_dispenser },
      ]}
      footnote={`${total} dossier(s) à traiter`}
    />
  );
}
