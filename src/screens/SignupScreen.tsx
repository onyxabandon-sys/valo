import React from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  email: string;
  password: string;
  confirmPassword: string;
  locationName: string;
  code: string;
  error: string;
  isLoading: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
};

export function SignupScreen({
  email,
  password,
  confirmPassword,
  locationName,
  code,
  error,
  isLoading,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onLocationChange,
  onCodeChange,
  onSubmit,
}: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundBottom} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.title}>Create organization</Text>
          <Text style={styles.subtitle}>Set up your workspace, operator access, and sign-in credentials.</Text>
        </View>

        <View style={styles.card}>
          <TextInput style={styles.input} value={locationName} onChangeText={onLocationChange} placeholder="Organization name" placeholderTextColor="#94A3B8" />
          <TextInput style={styles.input} value={code} onChangeText={onCodeChange} placeholder="Organization code" placeholderTextColor="#94A3B8" />
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={onEmailChange}
            placeholder="Contact email"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput style={styles.input} value={password} onChangeText={onPasswordChange} placeholder="Password" placeholderTextColor="#94A3B8" secureTextEntry />
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={onConfirmPasswordChange}
            placeholder="Confirm password"
            placeholderTextColor="#94A3B8"
            secureTextEntry
          />

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity style={[styles.button, isLoading ? styles.buttonDisabled : null]} onPress={onSubmit} disabled={isLoading} activeOpacity={0.9}>
            <Text style={styles.buttonText}>{isLoading ? 'Creating...' : 'Create account'}</Text>
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
    backgroundColor: 'rgba(37, 99, 235, 0.26)',
  },
  backgroundBottom: {
    position: 'absolute',
    left: -90,
    bottom: 80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
  },
  container: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 28, gap: 18, justifyContent: 'center', flexGrow: 1 },
  hero: { paddingBottom: 4 },
  title: { fontSize: 30, fontWeight: '900', color: '#FFFFFF' },
  subtitle: { fontSize: 15, color: '#CBD5E1', marginTop: 8, lineHeight: 21 },
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
  buttonDisabled: { backgroundColor: '#94A3B8' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
});
