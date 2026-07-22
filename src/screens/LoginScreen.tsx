import React from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  email: string;
  password: string;
  error: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: () => void;
  onSignup: () => void;
};

export function LoginScreen({ email, password, error, onEmailChange, onPasswordChange, onLogin, onSignup }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundBottom} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>V</Text>
          </View>
          <Text style={styles.title}>Valet POS</Text>
          <Text style={styles.subtitle}>Sign in to continue managing check-ins and slips.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Login</Text>
          <Text style={styles.cardCopy}>Use your work credentials to access the dashboard.</Text>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={onEmailChange}
            placeholder="Email"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={onPasswordChange}
            placeholder="Password"
            placeholderTextColor="#94A3B8"
            secureTextEntry
          />

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.button} onPress={onLogin} activeOpacity={0.9}>
            <Text style={styles.buttonText}>Sign in</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onSignup} style={styles.linkRow}>
            <Text style={styles.linkLabel}>Need an account?</Text>
            <Text style={styles.link}>Create organization</Text>
          </TouchableOpacity>
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
    backgroundColor: 'rgba(37, 99, 235, 0.30)',
  },
  backgroundBottom: {
    position: 'absolute',
    left: -90,
    bottom: 80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
  },
  container: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 28, gap: 18, justifyContent: 'center', flexGrow: 1 },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  logoMark: { width: 68, height: 68, borderRadius: 22, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoText: { color: '#FFFFFF', fontSize: 34, fontWeight: '900' },
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
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
    marginBottom: 12,
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
  button: { backgroundColor: '#2563EB', borderRadius: 18, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
  linkRow: { alignItems: 'center', marginTop: 18, gap: 4 },
  linkLabel: { color: '#64748B', fontSize: 13 },
  link: { color: '#2563EB', fontWeight: '800', fontSize: 14 },
});
