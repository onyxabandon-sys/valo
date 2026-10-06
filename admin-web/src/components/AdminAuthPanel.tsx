'use client';

import { FormEvent, useState } from 'react';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { authClient } from '@/lib/auth-client';

type AuthMode = 'signIn' | 'bootstrap';

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function AdminAuthPanel() {
  const bootstrapAvailable = useQuery(api.admin.getBootstrapAvailable, {});
  const bootstrapAdmin = useAction(api.admin.bootstrapFirstAdmin);
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (requiresTwoFactor) {
        const normalizedCode = code.trim();
        const result = useBackupCode
          ? await authClient.twoFactor.verifyBackupCode({ code: normalizedCode })
          : await authClient.twoFactor.verifyTotp({ code: normalizedCode, trustDevice: false });
        if (result.error) throw new Error(result.error.message ?? 'That authenticator code was not accepted.');
        setCode('');
        setRequiresTwoFactor(false);
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      if (mode === 'bootstrap') {
        if (password !== passwordConfirm) throw new Error('The passwords do not match.');
        await bootstrapAdmin({
          email: normalizedEmail,
          name: name.trim(),
          password,
          setupSecret,
        });
        setMode('signIn');
        setEmail(normalizedEmail);
        setPassword('');
        setPasswordConfirm('');
        setSetupSecret('');
        setNotice('Administrator account created. Sign in, then set up authenticator verification before using the dashboard.');
        return;
      }

      const result = await authClient.signIn.email({ email: normalizedEmail, password });
      if (result.error) throw new Error(result.error.message ?? 'Sign in failed. Check your credentials.');
      if (result.data && 'twoFactorRedirect' in result.data && result.data.twoFactorRedirect === true) {
        setRequiresTwoFactor(true);
        setPassword('');
      }
    } catch (submitError) {
      setError(messageFrom(submitError, 'The request failed. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-wrap">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="brand auth-brand">
          <div className="brand-mark" aria-hidden="true">V</div>
          <div><div className="brand-title">Valet Operations</div><div className="brand-subtitle">Protected administrator sign-in</div></div>
        </div>
        <div className="eyebrow">Valet POS · Operations</div>
        <h1 id="auth-title">{requiresTwoFactor ? 'Verify your sign-in' : mode === 'bootstrap' ? 'Create the configured administrator' : 'Sign in'}</h1>
        <p className="page-description auth-copy">
          {requiresTwoFactor
            ? 'Enter a code from your authenticator app. A backup code also works once.'
            : mode === 'bootstrap'
              ? 'This one-time setup needs the email and secret configured on the Convex server. No sign-up link is sent.'
              : 'Use an administrator account created by the system owner. Authenticator verification is required for dashboard access.'}
        </p>
        <form className="form-stack auth-form" onSubmit={submit}>
          {!requiresTwoFactor ? <>
            {mode === 'bootstrap' ? <div className="field"><label htmlFor="admin-name">Administrator name</label><input id="admin-name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required maxLength={80} /></div> : null}
            <div className="field"><label htmlFor="admin-email">Email</label><input id="admin-email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} /></div>
            <div className="field"><label htmlFor="admin-password">{mode === 'bootstrap' ? 'Administrator password' : 'Password'}</label><input id="admin-password" type="password" autoComplete={mode === 'bootstrap' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={128} /></div>
            {mode === 'bootstrap' ? <>
              <div className="field"><label htmlFor="admin-password-confirm">Confirm password</label><input id="admin-password-confirm" type="password" autoComplete="new-password" value={passwordConfirm} onChange={event => setPasswordConfirm(event.target.value)} required minLength={8} maxLength={128} /></div>
              <div className="field"><label htmlFor="bootstrap-secret">One-time setup secret</label><input id="bootstrap-secret" type="password" autoComplete="off" value={setupSecret} onChange={event => setSetupSecret(event.target.value)} required minLength={32} maxLength={256} /></div>
            </> : null}
          </> : <div className="field"><label htmlFor="admin-two-factor">{useBackupCode ? 'Backup code' : 'Authenticator code'}</label><input id="admin-two-factor" value={code} onChange={event => setCode(event.target.value)} required autoComplete="one-time-code" inputMode="numeric" maxLength={32} /></div>}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {notice ? <p className="notice" role="status">{notice}</p> : null}
          <button className="primary-button auth-submit" disabled={busy} type="submit">{busy ? 'Please wait…' : requiresTwoFactor ? 'Verify and continue' : mode === 'bootstrap' ? 'Create administrator' : 'Sign in'}</button>
        </form>
        {requiresTwoFactor ? <button className="text-button" type="button" onClick={() => { setUseBackupCode(value => !value); setCode(''); setError(''); }}>{useBackupCode ? 'Use authenticator code' : 'Use a backup code'}</button> : (
          mode === 'bootstrap'
            ? <button className="text-button" type="button" onClick={() => { setMode('signIn'); setPassword(''); setPasswordConfirm(''); setSetupSecret(''); setError(''); }}>Back to sign in</button>
            : bootstrapAvailable
              ? <button className="text-button" type="button" onClick={() => { setMode('bootstrap'); setNotice(''); setError(''); }}>Create the configured administrator</button>
              : null
        )}
        <p className="auth-footnote">Attendant accounts are created by an administrator. Public sign-up and password recovery links are disabled.</p>
      </section>
    </main>
  );
}
