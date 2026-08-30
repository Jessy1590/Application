import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../core/AuthContext.jsx';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: signInError } = await signIn({ email, password });

    setIsSubmitting(false);
    if (signInError) {
      setError(signInError.message);
    }
    // Succès : onAuthStateChange (AuthContext) met à jour la session,
    // App.jsx vérifie ensuite isAuthorized (rôle titulaire/admin).
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col gap-3"
      >
        <div className="flex flex-col items-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-full bg-sky-600 flex items-center justify-center">
            <ShieldCheck size={20} className="text-white" />
          </div>
          <h1 className="text-slate-900 text-lg font-semibold">PharmaOS — Dashboard Titulaire</h1>
          <p className="text-slate-500 text-sm text-center">
            Accès réservé au Titulaire / Admin
          </p>
        </div>

        <label className="text-xs font-medium text-slate-600" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
        />

        <label className="text-xs font-medium text-slate-600" htmlFor="password">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
        />

        {error && <p className="text-red-600 text-xs">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {isSubmitting ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
