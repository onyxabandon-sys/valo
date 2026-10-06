import React from 'react';
import { Image, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PostHogMaskView } from 'posthog-react-native';
import { AppIcon } from '../ui/AppIcon';
import { colors, radius } from '../ui/tokens';

type Props = {
  ownerEmail: string | null;
  deliveryChannel: 'whatsapp' | 'email-manual-whatsapp-fallback';
  codeSent: boolean;
  locationRequired: boolean;
  expiresAt?: number;
  busy: boolean;
  logoutBusy: boolean;
  code: string;
  error: string;
  message: string;
  onCodeChange: (value: string) => void;
  onRequestCode: () => void;
  onVerifyCode: () => void;
  onCompleteLocation: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
};

export function DeviceAccessScreen({ ownerEmail, deliveryChannel, codeSent, locationRequired, expiresAt, busy, logoutBusy, code, error, message, onCodeChange, onRequestCode, onVerifyCode, onCompleteLocation, onOpenSettings, onLogout }: Props) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (expiresAt === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  const expired = expiresAt !== undefined && expiresAt <= now;
  const showCodeEntry = codeSent && !expired;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Image source={require('../../assets/branding/valet-mark.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <Text style={styles.brandName}>Valet POS</Text>
        </View>

        <View style={styles.headingIcon}><AppIcon name="shield-lock-outline" color={colors.cobaltDeep} size={34} /></View>
        <Text style={styles.title}>{locationRequired ? 'Save your location to continue' : 'Approve this sign-in'}</Text>
        <Text style={styles.copy}>
          {locationRequired
            ? 'The code is approved. Allow foreground location so Valet POS can bind this account to this device.'
            : 'This account and sign-in session need approval before Valet POS can open.'}
        </Text>

        {!locationRequired ? <View style={styles.steps}>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>1</Text>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>{deliveryChannel === 'whatsapp' ? 'Direct WhatsApp code' : 'Email fallback'}</Text>
              <Text style={styles.stepCopy}>{deliveryChannel === 'whatsapp'
                ? 'Brevo sends the one-time code to the WhatsApp number saved on your approved account.'
                : ownerEmail ? `The fallback code goes to ${ownerEmail}.` : 'The fallback code goes to the private inbox set by the app owner.'}</Text>
            </View>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>2</Text>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>{deliveryChannel === 'whatsapp' ? 'Enter the code on this device' : 'Ask the owner to forward it'}</Text>
              <Text style={styles.stepCopy}>{deliveryChannel === 'whatsapp'
                ? 'Enter it here to approve this account, sign-in session, and device.'
                : 'The owner must send the code to you in a one-to-one WhatsApp chat. Brevo does not send this fallback code directly through WhatsApp.'}</Text>
            </View>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>3</Text>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>Enter the code here</Text>
              <Text style={styles.stepCopy}>The code works once, for this sign-in only, and expires after 15 minutes.</Text>
            </View>
          </View>
        </View> : (
          <View style={styles.locationNote}>
            <AppIcon name="map-marker-check-outline" color={colors.cobaltDeep} size={21} />
            <Text style={styles.locationCopy}>Valet POS requests precise location only while you complete this sign-in. It does not request background tracking.</Text>
          </View>
        )}

        {locationRequired ? (
          <>
            <TouchableOpacity accessibilityRole="button" onPress={onCompleteLocation} disabled={busy} style={[styles.primaryButton, busy && styles.disabled]}>
              <Text style={styles.primaryText}>{busy ? 'Saving location…' : 'Allow location and open Valet POS'}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={onOpenSettings} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Open location settings</Text>
            </TouchableOpacity>
          </>
        ) : showCodeEntry ? (
          <View style={styles.codeArea}>
            <Text style={styles.label}>8-digit approval code</Text>
            <PostHogMaskView>
              <TextInput
                accessibilityLabel="8-digit approval code"
                value={code}
                onChangeText={value => onCodeChange(value.replace(/\D/g, '').slice(0, 8))}
                placeholder="00000000"
                placeholderTextColor="#9AA5B6"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                style={styles.input}
              />
            </PostHogMaskView>
            <TouchableOpacity accessibilityRole="button" onPress={onVerifyCode} disabled={busy || code.length !== 8} style={[styles.primaryButton, (busy || code.length !== 8) && styles.disabled]}>
              <Text style={styles.primaryText}>{busy ? 'Checking code…' : 'Approve this sign-in'}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={onRequestCode} disabled={busy} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>{busy ? 'Sending…' : 'Send a new code'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity accessibilityRole="button" onPress={onRequestCode} disabled={busy} style={[styles.primaryButton, busy && styles.disabled]}>
            <Text style={styles.primaryText}>{busy ? 'Sending code…' : expired ? 'Code expired · send a new one' : 'Send approval code'}</Text>
          </TouchableOpacity>
        )}

        {!!message && <Text accessibilityRole="text" style={styles.success}>{message}</Text>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

        <TouchableOpacity accessibilityRole="button" onPress={onLogout} disabled={logoutBusy} style={styles.logout}>
          <AppIcon name="logout" size={18} color={colors.muted} />
          <Text style={styles.logoutText}>{logoutBusy ? 'Signing out…' : 'Log out and remove this approval request'}</Text>
        </TouchableOpacity>
        <Text style={styles.footer}>If you did not start this sign-in, log out and tell the app owner.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.porcelain },
  page: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 30 },
  mark: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.cobalt, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 27, height: 27 },
  brandName: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  headingIcon: { width: 60, height: 60, borderRadius: radius.medium, backgroundColor: colors.blueCanvas, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5 },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 24 },
  steps: { gap: 17, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 18, marginBottom: 21 },
  locationNote: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 16, marginBottom: 20 },
  locationCopy: { flex: 1, color: colors.muted, fontSize: 13, lineHeight: 19 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNumber: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', backgroundColor: colors.blueCanvas, color: colors.cobaltDeep, fontSize: 13, fontWeight: '800' },
  stepText: { flex: 1, gap: 3 },
  stepTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  stepCopy: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  codeArea: { gap: 9 },
  label: { color: colors.inkSoft, fontSize: 13, fontWeight: '700' },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.line, borderRadius: radius.medium, backgroundColor: colors.surface, paddingHorizontal: 16, color: colors.ink, fontSize: 22, letterSpacing: 6, textAlign: 'center' },
  primaryButton: { minHeight: 54, borderRadius: radius.medium, backgroundColor: colors.cobalt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 2 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.cobaltDeep, fontSize: 14, fontWeight: '700' },
  success: { color: colors.mintText, backgroundColor: colors.mintSoft, borderRadius: 12, padding: 12, marginTop: 12, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12, marginTop: 12, fontSize: 13, lineHeight: 19 },
  logout: { minHeight: 48, borderTopWidth: 1, borderColor: colors.line, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  logoutText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 2 },
});
