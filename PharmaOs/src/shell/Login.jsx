import React, { useState } from 'react';
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
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-900/95">
      <form
        onSubmit={handleSubmit}
        className="w-72 flex flex-col gap-2 bg-slate-800/90 rounded-lg p-4 shadow-lg"
      >
        <h1 className="text-white text-sm font-semibold mb-1 text-center">
          PharmaOS — Connexion
        </h1>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="username"
          required
          className="px-2 py-1.5 rounded bg-slate-700 text-white text-xs placeholder-slate-400 outline-none focus:ring-1 focus:ring-sky-500"
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          autoComplete="current-password"
          required
          className="px-2 py-1.5 rounded bg-slate-700 text-white text-xs placeholder-slate-400 outline-none focus:ring-1 focus:ring-sky-500"
        />

        {error && <p className="text-red-400 text-xs text-center">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 px-2 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {isSubmitting ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
