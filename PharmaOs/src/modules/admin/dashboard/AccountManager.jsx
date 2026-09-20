import React, { useState } from 'react';
import { UserCog } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  ChangePasswordForm,
  ChangeEmailForm,
  DisplayNameForm,
} from '../shared/AccountForms.jsx';

/**
 * Dashboard / module — mon compte : nom, e-mail, mot de passe.
 * Branché sur Auth Supabase (updateUser / verifyOtp) + portail.profiles.
 */
export default function AccountManager({ compact = false }) {
  const { user, profile, reloadProfile } = useAuth();
  const [email, setEmail] = useState(user?.email || profile?.email || '');

  const afterProfile = async () => {
    await reloadProfile?.();
  };

  return (
    <div className={compact ? 'space-y-4 p-4' : 'space-y-5 max-w-xl'}>
      {!compact && (
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <UserCog className="text-slate-600" /> Mon compte
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Identifiants Supabase Auth (e-mail / mot de passe) et profil PharmaOS.
          </p>
        </div>
      )}

      <DisplayNameForm
        userId={user?.id}
        initialName={profile?.display_name || ''}
        onSuccess={afterProfile}
      />

      <ChangeEmailForm
        currentEmail={email}
        onSuccess={async (next) => {
          setEmail(next);
          await afterProfile();
        }}
      />

      <ChangePasswordForm requireCurrent onSuccess={afterProfile} />
    </div>
  );
}
