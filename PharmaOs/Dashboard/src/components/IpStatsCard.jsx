import React, { useState, useEffect } from 'react';
import { fetchIpsWithProfiles } from '../services/ipService';
import { Activity, CheckCircle, AlertTriangle, ChevronRight, User, Stethoscope, Pill, AlertOctagon } from 'lucide-react';

export default function IpStatsCard({ onNavigate }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchIpsWithProfiles().then(ips => {
      let pendingCount = 0;
      let acceptedCount = 0;
      let avisDonnesCount = 0;
      
      const teamCounts = {};
      const drugCounts = {};
      const problemCounts = {};

      ips.forEach(ip => {
        // Comptage statuts
        if (ip.statut_ip === 'En attente') pendingCount++;
        if (ip.avis_prescripteur && !ip.avis_prescripteur.toLowerCase().includes('attente')) {
          avisDonnesCount++;
          if (ip.avis_prescripteur.toLowerCase().includes('accept')) acceptedCount++;
        }

        // Équipe
        const name = ip.profile.display_name;
        if (name !== 'Inconnu') teamCounts[name] = (teamCounts[name] || 0) + 1;

        // Médicaments
        const drug = ip.medicament_en_cause || 'Non renseigné';
        drugCounts[drug] = (drugCounts[drug] || 0) + 1;

        // Problèmes
        const problem = ip.probleme_identifie || 'Non renseigné';
        problemCounts[problem] = (problemCounts[problem] || 0) + 1;
      });

      setStats({
        total: ips.length,
        pending: pendingCount,
        acceptRate: avisDonnesCount > 0 ? Math.round((acceptedCount / avisDonnesCount) * 100) : 0,
        teamRanking: Object.entries(teamCounts).sort((a, b) => b[1] - a[1]).slice(0, 4),
        topDrugs: Object.entries(drugCounts).sort((a, b) => b[1] - a[1]).slice(0, 3),
        topProblems: Object.entries(problemCounts).sort((a, b) => b[1] - a[1]).slice(0, 3),
        lastIps: ips.slice(0, 3)
      });
    }).catch(console.error);
  }, []);

  if (!stats) return <div className="bg-white p-5 rounded-xl border border-slate-200 animate-pulse h-64 md:col-span-2 xl:col-span-3"></div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col md:col-span-2 xl:col-span-3 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sky-600">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="text-slate-800 font-bold text-base">Act-IP & Qualité</h3>
          </div>
        </div>
        <button onClick={() => onNavigate('ip')} className="text-sm font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1">
          Gérer <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 p-5 gap-6">
        {/* Colonne 1 : KPIs & Équipe */}
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
              <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Total</p>
              <p className="text-xl font-bold text-slate-800">{stats.total}</p>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-center">
              <p className="text-[10px] text-amber-600 font-bold uppercase mb-1">En attente</p>
              <p className="text-xl font-bold text-amber-700">{stats.pending}</p>
            </div>
            <div className="col-span-2 bg-emerald-50 p-3 rounded-lg border border-emerald-100 flex justify-between items-center">
              <p className="text-xs text-emerald-700 font-bold uppercase">Taux Acceptation</p>
              <p className="text-xl font-bold text-emerald-700">{stats.acceptRate}%</p>
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Top Contributeurs</h4>
            <div className="space-y-1.5">
              {stats.teamRanking.map(([name, count]) => (
                <div key={name} className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-2 text-slate-700 font-medium"><User size={12} className="text-sky-500"/> {name}</span>
                  <span className="font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Colonne 2 : Statistiques des causes */}
        <div className="space-y-5 md:border-l md:border-r border-slate-100 md:px-6">
          <div>
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Pill size={12}/> Top Médicaments</h4>
            <div className="space-y-2">
              {stats.topDrugs.map(([name, count]) => (
                <div key={name} className="flex justify-between items-center text-xs border-b border-slate-50 pb-1">
                  <span className="text-slate-700 truncate pr-2">{name}</span>
                  <span className="font-bold text-sky-600">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 mt-4"><AlertOctagon size={12}/> Problèmes Fréquents</h4>
            <div className="space-y-2">
              {stats.topProblems.map(([name, count]) => (
                <div key={name} className="flex justify-between items-center text-xs border-b border-slate-50 pb-1">
                  <span className="text-slate-700 truncate pr-2">{name}</span>
                  <span className="font-bold text-rose-500">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Colonne 3 : Dernières IP */}
        <div>
          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Dernières Interventions</h4>
          <div className="space-y-2">
            {stats.lastIps.map(ip => (
              <div key={ip.id} className="p-2.5 border border-slate-200 rounded-lg bg-white shadow-sm">
                <div className="flex justify-between items-center mb-1">
                  <div className="font-semibold text-xs text-slate-800 flex items-center gap-1">
                    <Stethoscope size={12} className="text-slate-400" /> {ip.patient_initiales || 'Patient'}
                  </div>
                  {ip.statut_ip === 'Cloturee' && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">Prête</span>}
                  {ip.statut_ip === 'En attente' && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">Attente</span>}
                  {ip.statut_ip === 'Déclaré' && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">Déclarée</span>}
                </div>
                <div className="text-[11px] text-slate-600 truncate">{ip.medicament_en_cause}</div>
                <div className="text-[9px] text-slate-400 mt-1">Par {ip.profile.display_name} • {new Date(ip.created_at).toLocaleDateString('fr-FR')}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}