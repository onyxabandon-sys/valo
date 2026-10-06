import React from 'react';
import { PostHogMaskView } from 'posthog-react-native';
import { Image, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../ui/AppIcon';

type Props = {
  email: string;
  password: string;
  error: string;
  isLoading: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: () => void;
  twoFactorRequired?: boolean;
  twoFactorCode?: string;
  onTwoFactorCodeChange?: (value: string) => void;
  onVerifyTwoFactor?: (code: string, useBackupCode: boolean) => void;
};

export function LoginScreen({ email, password, error, isLoading, onEmailChange, onPasswordChange, onLogin, twoFactorRequired = false, twoFactorCode = '', onTwoFactorCodeChange, onVerifyTwoFactor }: Props) {
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  const [useBackupCode, setUseBackupCode] = React.useState(false);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundBottom} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.logoMark}>
            <Image source={require('../../assets/branding/valet-mark.png')} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={styles.title}>Valet POS</Text>
          <Text style={styles.subtitle}>Sign in with the account created for you by an administrator.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{twoFactorRequired ? 'Verify it’s you' : 'Login'}</Text>
          <Text style={styles.cardCopy}>{twoFactorRequired ? 'Enter a code from your authenticator app to finish signing in.' : 'Use your work credentials. WhatsApp approval and foreground location are required before the app opens.'}</Text>

          {!twoFactorRequired ? <View style={styles.inputShell}>
            <AppIcon name="email-outline" color="#64748B" size={21} />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={onEmailChange}
              placeholder="Email"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View> : null}
          {!twoFactorRequired ? <PostHogMaskView>
            <View style={styles.inputShell}>
              <AppIcon name="lock-outline" color="#64748B" size={21} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={onPasswordChange}
                placeholder="Password"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!isPasswordVisible}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
                activeOpacity={0.7}
                hitSlop={8}
                onPress={() => setIsPasswordVisible(value => !value)}
                style={styles.inputAction}
              >
                <AppIcon name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'} color="#64748B" size={22} />
              </TouchableOpacity>
            </View>
          </PostHogMaskView> : (
            <PostHogMaskView>
              <View style={styles.inputShell}>
                <AppIcon name="shield-key-outline" color="#64748B" size={21} />
                <TextInput
                  style={styles.input}
                  value={twoFactorCode}
                  onChangeText={onTwoFactorCodeChange}
                  placeholder={useBackupCode ? 'Backup code' : '6-digit code'}
                  placeholderTextColor="#94A3B8"
                  keyboardType={useBackupCode ? 'default' : 'number-pad'}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={useBackupCode ? 32 : 8}
                />
              </View>
            </PostHogMaskView>
          )}

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity style={[styles.button, isLoading ? styles.buttonDisabled : null]} onPress={twoFactorRequired ? () => onVerifyTwoFactor?.(twoFactorCode, useBackupCode) : onLogin} disabled={isLoading} activeOpacity={0.9}>
            <Text style={styles.buttonText}>{isLoading ? 'Checking...' : twoFactorRequired ? 'Verify and sign in' : 'Sign in'}</Text>
            {!isLoading ? <View style={styles.buttonIcon}><AppIcon name="arrow-right" color="#FFFFFF" size={21} /></View> : null}
          </TouchableOpacity>

          {twoFactorRequired ? (
            <TouchableOpacity accessibilityRole="button" onPress={() => { setUseBackupCode(value => !value); onTwoFactorCodeChange?.(''); }} activeOpacity={0.75} style={styles.linkRow}>
              <Text style={styles.link}>{useBackupCode ? 'Use authenticator code' : 'Use a backup code'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A' },
  backgroundTop: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  backgroundBottom: {
    position: 'absolute',
    left: -90,
    bottom: 80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
  },
  container: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 28, gap: 18, justifyContent: 'center', flexGrow: 1 },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  logoMark: { width: 68, height: 68, borderRadius: 22, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoImage: { width: 46, height: 46 },
  title: { fontSize: 30, fontWeight: '900', color: '#FFFFFF' },
  subtitle: { fontSize: 15, color: '#CBD5E1', textAlign: 'center', marginTop: 8, maxWidth: 300, lineHeight: 21 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    padding: 20,
    shadowColor: '#020617',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
  cardTitle: { fontSize: 26, fontWeight: '800', color: '#0F172A' },
  cardCopy: { fontSize: 14, color: '#64748B', marginTop: 6, marginBottom: 18, lineHeight: 20 },
  inputShell: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 16,
    color: '#0F172A',
  },
  inputAction: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  errorText: { color: '#B91C1C', fontSize: 13, lineHeight: 18 },
  button: { minHeight: 56, backgroundColor: '#2563EB', borderRadius: 18, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonIcon: { position: 'absolute', right: 18 },
  buttonDisabled: { backgroundColor: '#94A3B8' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
  linkRow: { alignItems: 'center', marginTop: 18, gap: 4 },
  linkLabel: { color: '#64748B', fontSize: 13 },
  link: { color: '#2563EB', fontWeight: '800', fontSize: 14 },
});
