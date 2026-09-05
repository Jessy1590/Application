import React, { useState, useEffect } from 'react';
import { Sparkles, Tag, Trophy, MapPin, MessageSquare } from 'lucide-react';
import { fetchTodayActions } from '../services/perimesService.js';

function ActionCard({ icon: Icon, title, color, items, renderMeta }) {
  return (
    <section>
      <h3 className={`text-lg font-bold mb-3 flex items-center gap-2 ${color}`}>
        <Icon size={20} /> {title}
        <span className="text-sm font-normal text-slate-400">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500 mb-6">Rien pour aujourd’hui.</p>
      ) : (
        <div className="space-y-3 mb-8">
          {items.map((p) => (
            <div key={p.id} className="bg-white border rounded-xl p-4 shadow-sm text-sm">
              <p className="font-bold text-slate-800 text-base">{p.medicament}</p>
              {renderMeta(p)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function PerimesVitrine() {
  const [data, setData] = useState({ mise_en_avant: [], promo: [], challenges: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setData(await fetchTodayActions());
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center text-slate-500">Chargement…</div>;
  }

  return (
    <div className="w-full h-full bg-slate-50 text-slate-800 overflow-y-auto p-6">
      <h2 className="text-2xl font-bold mb-1">Actions du jour</h2>
      <p className="text-sm text-slate-500 mb-6">
        Mises en avant, promotions et challenges équipe valables aujourd’hui.
      </p>
      {err && <p className="mb-4 text-sm text-red-700 bg-red-50 p-3 rounded-lg">{err}</p>}

      <ActionCard
        icon={Sparkles}
        title="Mises en avant"
        color="text-amber-800"
        items={data.mise_en_avant}
        renderMeta={(p) => (
          <>
            <p className="text-slate-600 mt-1 flex items-center gap-1">
              <MapPin size={14} /> {p.mise_en_avant_emplacement || 'Emplacement non précisé'}
              {p.mise_en_avant_montant != null && (
                <span className="ml-2 font-semibold text-amber-700">{p.mise_en_avant_montant} €</span>
              )}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Du {new Date(p.mise_en_avant_debut).toLocaleDateString('fr-FR')}
              {' au '}
              {new Date(p.mise_en_avant_fin).toLocaleDateString('fr-FR')}
              {' · DLC '}
              {new Date(p.date_peremption).toLocaleDateString('fr-FR')}
            </p>
            {p.mise_en_avant_message && (
              <p className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded-lg text-amber-900 flex gap-2">
                <MessageSquare size={14} className="shrink-0 mt-0.5" />
                {p.mise_en_avant_message}
              </p>
            )}
          </>
        )}
      />

      <ActionCard
        icon={Tag}
        title="Promotions"
        color="text-emerald-800"
        items={data.promo}
        renderMeta={(p) => (
          <>
            <p className="text-slate-600 mt-1 flex items-center gap-1">
              <MapPin size={14} /> {p.promo_emplacement || 'Emplacement non précisé'}
              {p.promo_montant != null && (
                <span className="ml-2 font-semibold text-emerald-700">{p.promo_montant} €</span>
              )}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Du {new Date(p.promo_debut).toLocaleDateString('fr-FR')}
              {' au '}
              {new Date(p.promo_fin).toLocaleDateString('fr-FR')}
            </p>
            {p.promo_message && (
              <p className="mt-2 p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-900 flex gap-2">
                <MessageSquare size={14} className="shrink-0 mt-0.5" />
                {p.promo_message}
              </p>
            )}
          </>
        )}
      />

      <ActionCard
        icon={Trophy}
        title="Challenges équipe"
        color="text-violet-800"
        items={data.challenges}
        renderMeta={(p) => (
          <>
            <p className="font-medium text-violet-900 mt-1">{p.challenge_titre || 'Challenge'}</p>
            {p.challenge_objectif && <p className="text-slate-600 mt-0.5">{p.challenge_objectif}</p>}
            {p.challenge_fin && (
              <p className="text-xs text-slate-400 mt-1">
                Jusqu’au {new Date(p.challenge_fin).toLocaleDateString('fr-FR')}
              </p>
            )}
            {p.challenge_message && (
              <p className="mt-2 p-2 bg-violet-50 border border-violet-100 rounded-lg text-violet-900 flex gap-2">
                <MessageSquare size={14} className="shrink-0 mt-0.5" />
                {p.challenge_message}
              </p>
            )}
          </>
        )}
      />
    </div>
  );
}
