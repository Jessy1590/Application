import React, { useState } from 'react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { createComptoirQuickAction } from '../services/taskService.js';
import { closeModuleWindow } from '../../../shared/windowService.js';
import PatientOrderForm from '../shared/PatientOrderForm.jsx';
import { Save, ShoppingBag, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export default function QuickAction({ type }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const initialForm = {
    nom: '', prenom: '', dob: '', medicament: '', facture: '',
    cip: '', recurrence_semaines: 4, repetitions: 3,
    date: new Date().toISOString().split('T')[0], commentaire: '',
  };
  const [form, setForm] = useState(initialForm);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const payload = {
        ...form,
        medicament_ou_facture: type === 'order' ? form.medicament : form.facture,
      };
      await createComptoirQuickAction(type, payload, user.id);
      setSuccessMsg("Créé et assigné à l'équipe avec succès.");
      setForm(initialForm);
      setTimeout(() => closeModuleWindow(), 800);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center gap-2 shadow-sm">
        {type === 'order' ? <ShoppingBag className="text-emerald-500" /> : <FileText className="text-sky-500" />}
        <h2 className="font-bold text-xl">
          {type === 'order' ? 'Commander un médicament' : 'Facturation à effectuer'}
        </h2>
      </div>

      <div className="p-6 overflow-y-auto">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5 text-sm">
          {successMsg && (
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 border border-emerald-200">
              <CheckCircle2 size={18} /> {successMsg}
            </div>
          )}
          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 border border-red-200 break-words">
              <AlertCircle size={18} className="shrink-0" /> {errorMsg}
            </div>
          )}

          <PatientOrderForm
            type={type === 'order' ? 'order' : 'billing'}
            form={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          />

          <button type="submit" disabled={loading} className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2 transition-colors">
            <Save size={18} /> {loading ? 'Enregistrement...' : "Créer et assigner à l'équipe"}
          </button>
        </form>
      </div>
    </div>
  );
}
