'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function AdminMfaSetup() {
  const [password, setPassword] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [savedCodes, setSavedCodes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const enable = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await authClient.twoFactor.enable({ password, issuer: 'Valet POS' });
      if (result.error || !result.data) throw new Error(result.error?.message ?? 'Could not start authenticator setup.');
      setTotpUri(result.data.totpURI);
      setBackupCodes(result.data.backupCodes);
      setPassword('');
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : 'Could not start authenticator setup.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice: false });
      if (result.error) throw new Error(result.error.message ?? 'That authenticator code was not accepted.');
      await authClient.signOut();
      setNotice('Authenticator verification is active. Sign in again with a fresh code to continue.');
      setTimeout(() => window.location.reload(), 900);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Could not verify the authenticator code.');
    } finally {
      setBusy(false);
    }
  };

  const copyBackupCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setNotice('Backup codes copied. Store them in a private password manager.');
    } catch {
      setError('Clipboard access failed. Copy the backup codes by hand before continuing.');
    }
  };

  return (
    <section className="setup-panel" aria-labelledby="mfa-title">
      <div className="eyebrow">Required for administrators</div>
      <h2 id="mfa-title">Enable authenticator verification</h2>
      <p>Every administrator function checks MFA on the server. Set up an authenticator app before continuing.</p>
      {!totpUri ? <>
        <label className="field"><span>Current account password</span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} maxLength={128} /></label>
        <button className="primary-button" type="button" onClick={() => void enable()} disabled={busy || password.length < 8}>{busy ? 'Starting…' : 'Set up authenticator'}</button>
      </> : <>
        <div className="setup-step"><strong>1. Add the account</strong><span>In your authenticator app, add an account with this setup URI:</span><code className="totp-uri">{totpUri}</code></div>
        <div className="setup-step"><strong>2. Save backup codes</strong><span>Each code works once. Keep these outside this computer.</span><div className="backup-codes">{backupCodes.map(item => <code key={item}>{item}</code>)}</div><button className="secondary-button" type="button" onClick={() => void copyBackupCodes()}>Copy backup codes</button><label className="check-row"><input type="checkbox" checked={savedCodes} onChange={event => setSavedCodes(event.target.checked)} /> I saved these backup codes</label></div>
        <label className="field"><span>3. Verify a fresh authenticator code</span><input value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" maxLength={8} /></label>
        <button className="primary-button" type="button" onClick={() => void verify()} disabled={busy || !savedCodes || code.trim().length < 6}>{busy ? 'Verifying…' : 'Verify and sign in again'}</button>
      </>}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="notice" role="status">{notice}</p> : null}
    </section>
  );
}
