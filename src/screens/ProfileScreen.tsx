import React from 'react';
import { PostHogMaskView } from 'posthog-react-native';
import { ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../ui/AppIcon';
import { User } from '../types';
import { authClient } from '../data/authClient';

type Props = {
  user: User;
  onLogout: () => Promise<void>;
};

export function ProfileScreen({ user, onLogout }: Props) {
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [secret, setSecret] = React.useState('');
  const [backupCodes, setBackupCodes] = React.useState<string[]>([]);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [logoutBusy, setLogoutBusy] = React.useState(false);
  const [logoutError, setLogoutError] = React.useState('');
  const { data: session } = authClient.useSession();
  const twoFactorEnabled = Boolean(session?.user?.twoFactorEnabled);

  const startTotpSetup = async () => {
    if (!password) {
      setError('Enter your account password to set up two-step verification.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await authClient.twoFactor.enable({ password, issuer: 'Valet POS' });
      if (result.error) {
        setError(result.error.message ?? 'Could not start authenticator setup.');
      } else if (result.data?.totpURI) {
        const uri = new URL(result.data.totpURI);
        setSecret(uri.searchParams.get('secret') ?? '');
        setBackupCodes(result.data.backupCodes ?? []);
        setMessage('Add this key in your authenticator app, then enter its current code below.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start authenticator setup.');
    } finally {
      setBusy(false);
    }
  };

  const verifyTotpSetup = async () => {
    if (code.trim().length < 6) {
      setError('Enter the current code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice: false });
      if (result.error) {
        setError(result.error.message ?? 'That code was not accepted. Try again.');
      } else {
        setSecret('');
        setCode('');
        setPassword('');
        setMessage('Two-step verification is enabled. Save these backup codes somewhere private.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not verify the authenticator code.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    setLogoutError('');
    try {
      await onLogout();
    } catch (cause) {
      setLogoutError(cause instanceof Error ? cause.message : 'Could not remove this sign-in. Check your connection and try again.');
    } finally {
      setLogoutBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <AppIcon name="account-tie" color="#2563EB" size={44} />
          </View>
          <Text style={styles.title}>{user.name}</Text>
          <Text style={styles.subtitle}>{user.organizationName}</Text>
        </View>

        <View style={styles.card}>
          <Row label="Email" value={user.email} />
          <Row label="Organization" value={user.organizationName} />
          <PostHogMaskView>
            <Row label="Organization Code" value={user.organizationCode} />
          </PostHogMaskView>
        </View>

        <View style={styles.securityCard}>
          <Text style={styles.securityTitle}>Two-step verification</Text>
          <Text style={styles.securityCopy}>
            {twoFactorEnabled ? 'Authenticator verification is enabled for this account.' : 'Use an authenticator app to require a fresh code every time you sign in.'}
          </Text>
          {!twoFactorEnabled && !secret ? (
            <>
              <PostHogMaskView>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Account password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                  autoCapitalize="none"
                  style={styles.securityInput}
                />
              </PostHogMaskView>
              <TouchableOpacity style={styles.securityButton} onPress={() => void startTotpSetup()} disabled={busy}>
                <Text style={styles.securityButtonText}>{busy ? 'Starting...' : 'Set up authenticator'}</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {!!secret ? (
            <>
              <Text style={styles.securityCopy}>In your authenticator app, choose “Enter setup key” and use this key for Valet POS:</Text>
              <PostHogMaskView>
                <Text selectable style={styles.secret}>{secret}</Text>
              </PostHogMaskView>
              <PostHogMaskView>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="6-digit authenticator code"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  maxLength={8}
                  style={styles.securityInput}
                />
              </PostHogMaskView>
              <TouchableOpacity style={styles.securityButton} onPress={() => void verifyTotpSetup()} disabled={busy}>
                <Text style={styles.securityButtonText}>{busy ? 'Verifying...' : 'Verify and enable'}</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {backupCodes.length > 0 && !secret ? (
            <PostHogMaskView>
              <View style={styles.backupBox}>
                <Text style={styles.backupTitle}>Backup codes</Text>
                {backupCodes.map(backupCode => <Text key={backupCode} selectable style={styles.backupCode}>{backupCode}</Text>)}
              </View>
            </PostHogMaskView>
          ) : null}
          {!!message ? <Text style={styles.securityCopy}>{message}</Text> : null}
          {!!error ? <Text style={styles.securityError}>{error}</Text> : null}
        </View>

        {!!logoutError ? <Text accessibilityRole="alert" style={styles.securityError}>{logoutError}</Text> : null}
        <TouchableOpacity accessibilityRole="button" style={styles.logout} onPress={logout} disabled={logoutBusy} activeOpacity={0.9}>
          <AppIcon name="logout" color="#FFFFFF" size={21} />
          <Text style={styles.logoutText}>{logoutBusy ? 'Removing access…' : 'Logout'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 112, gap: 14 },
  hero: { alignItems: 'center', paddingVertical: 16 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#CBD5E1', fontSize: 15, marginTop: 6 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 30, paddingHorizontal: 18, paddingVertical: 8 },
  securityCard: { backgroundColor: '#F8FAFC', borderRadius: 22, padding: 18, gap: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  securityTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900' },
  securityCopy: { color: '#475569', fontSize: 14, lineHeight: 20 },
  securityInput: { minHeight: 50, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 14, paddingHorizontal: 14, color: '#0F172A', backgroundColor: '#FFFFFF', fontSize: 16 },
  securityButton: { minHeight: 50, borderRadius: 14, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  securityButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secret: { color: '#0F172A', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, fontSize: 17, fontWeight: '800', letterSpacing: 1.5 },
  backupBox: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, gap: 7 },
  backupTitle: { color: '#0F172A', fontWeight: '900', marginBottom: 4 },
  backupCode: { color: '#0F172A', fontFamily: 'monospace', fontSize: 15 },
  securityError: { color: '#B91C1C', fontSize: 14, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  label: { color: '#64748B', fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  value: { color: '#0F172A', fontSize: 15, fontWeight: '800', maxWidth: '60%', textAlign: 'right' },
  logout: {
    minHeight: 56,
    flexDirection: 'row',
    gap: 9,
    backgroundColor: '#DC2626',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});
