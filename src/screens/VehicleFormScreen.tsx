import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../ui/AppIcon';
import { colors, fonts, radius, surfaceShadow } from '../ui/tokens';
import { PricedVehicleType } from '../types';

type Props = {
  vehicleType: PricedVehicleType;
  vehicleNumber: string;
  amount: string;
  locationName: string;
  error: string;
  isSubmitting: boolean;
  onVehicleNumberChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
};

export function VehicleFormScreen({
  vehicleType,
  vehicleNumber,
  amount,
  locationName,
  error,
  isSubmitting,
  onVehicleNumberChange,
  onSubmit,
  onBack,
}: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.back} onPress={onBack} accessibilityLabel="Go back">
              <AppIcon name="arrow-left" color={colors.ink} size={23} />
            </TouchableOpacity>
            <View style={styles.stepPill}>
              <Text style={styles.stepText}>STEP 2 / 2</Text>
            </View>
          </View>

          <Text style={styles.eyebrow}>{vehicleType.toUpperCase()} / RS. {Number(amount).toFixed(0)}</Text>
          <Text style={styles.title}>Enter the plate.</Text>
          <Text style={styles.subtitle}>Use the number shown on the vehicle. Spaces and hyphens are accepted.</Text>

          <View style={styles.plateCard}>
            <View style={styles.plateHeader}>
              <Text style={styles.plateHeaderText}>VEHICLE REGISTRATION</Text>
              <Text style={styles.plateCountry}>PK</Text>
            </View>
            <TextInput
              value={vehicleNumber}
              onChangeText={onVehicleNumberChange}
              style={styles.input}
              placeholder="ABC-123"
              placeholderTextColor="#9AA5B6"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={24}
              autoFocus
              editable={!isSubmitting}
              returnKeyType="done"
              onSubmitEditing={onSubmit}
              selectionColor={colors.cobalt}
              accessibilityLabel="Vehicle registration number"
            />
            <Text style={styles.inputHint}>Example: LEA 12 3456</Text>
          </View>

          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.summaryLabel}>PARKING FEE</Text>
              <Text style={styles.summaryLocation}>{locationName}</Text>
            </View>
            <Text style={styles.summaryPrice}>Rs. {Number(amount).toFixed(0)}</Text>
          </View>

          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorTitle}>Check the plate number</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={onSubmit}
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            disabled={isSubmitting}
            activeOpacity={0.9}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>{isSubmitting ? 'Saving receipt...' : 'Save, print & finish'}</Text>
            {!isSubmitting ? <View style={styles.buttonArrow}><AppIcon name="printer-outline" color={colors.surface} size={21} /></View> : null}
          </TouchableOpacity>

          <Text style={styles.footer}>The receipt is saved on this device before printing starts.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  back: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepPill: { backgroundColor: colors.cobaltSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  stepText: { color: colors.cobalt, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  eyebrow: { color: colors.mintText, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 36, lineHeight: 42, fontWeight: '900', letterSpacing: -1, marginTop: 8 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 9, marginBottom: 22, maxWidth: 350 },
  plateCard: { backgroundColor: colors.blueSurface, borderWidth: 2, borderColor: colors.ink, borderRadius: 20, overflow: 'hidden', ...surfaceShadow },
  plateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.ink, paddingHorizontal: 16, paddingVertical: 10 },
  plateHeaderText: { color: colors.surface, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  plateCountry: { color: colors.amber, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  input: { minHeight: 94, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, color: colors.ink, fontSize: 30, lineHeight: 40, fontWeight: '900', fontFamily: fonts.utility, letterSpacing: 1.5, textAlign: 'center' },
  inputHint: { color: colors.muted, fontSize: 11, fontWeight: '600', textAlign: 'center', paddingBottom: 14 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.amberSoft, borderRadius: radius.medium, padding: 16, marginTop: 14, borderWidth: 1, borderColor: '#F6D98F' },
  summaryLabel: { color: '#8A6100', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  summaryLocation: { color: colors.muted, fontSize: 12, marginTop: 4, maxWidth: 210 },
  summaryPrice: { color: colors.ink, fontSize: 24, fontWeight: '900' },
  errorBox: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: '#F4B8B8', borderRadius: radius.medium, padding: 14, marginTop: 14 },
  errorTitle: { color: colors.danger, fontSize: 14, fontWeight: '900' },
  errorText: { color: '#9F3030', fontSize: 12, lineHeight: 17, marginTop: 3 },
  button: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cobalt, borderRadius: radius.medium, paddingHorizontal: 18, marginTop: 18, ...surfaceShadow },
  buttonDisabled: { backgroundColor: '#9AA5B6' },
  buttonText: { color: colors.surface, fontWeight: '900', fontSize: 16 },
  buttonArrow: { position: 'absolute', right: 20 },
  footer: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 12, paddingHorizontal: 20 },
});
