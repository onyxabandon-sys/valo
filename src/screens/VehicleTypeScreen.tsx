import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VEHICLE_RATES } from '../data/seed';
import { AppIcon } from '../ui/AppIcon';
import { colors, radius, surfaceShadow } from '../ui/tokens';
import { PricedVehicleType } from '../types';

type Props = {
  selectedVehicle: PricedVehicleType;
  onContinue: (vehicle: PricedVehicleType) => void;
  onBack: () => void;
};

const OPTIONS = [
  { vehicle: 'Bike' as const, icon: 'motorbike' as const, note: 'Motorcycle and scooter' },
  { vehicle: 'Car' as const, icon: 'car-outline' as const, note: 'Car, SUV and compact van' },
];

function VehicleCard({ vehicle, icon, note, active, onPress }: { vehicle: PricedVehicleType; icon: 'motorbike' | 'car-outline'; note: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.card, active && styles.cardActive]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`${vehicle}, Rs. ${VEHICLE_RATES[vehicle]}`}
    >
      <View style={styles.cardTop}>
        <View style={[styles.vehicleCode, active && styles.vehicleCodeActive]}>
          <AppIcon name={icon} color={colors.surface} size={27} />
        </View>
        <AppIcon name="arrow-right" color={colors.cobalt} size={25} />
      </View>
      <Text style={styles.cardTitle}>{vehicle}</Text>
      <Text style={styles.cardNote}>{note}</Text>
      <View style={styles.priceRow}>
        <Text style={styles.priceLabel}>PARKING FEE</Text>
        <Text style={styles.price}>Rs. {VEHICLE_RATES[vehicle]}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function VehicleTypeScreen({ selectedVehicle, onContinue, onBack }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.back} onPress={onBack} accessibilityLabel="Go back">
            <AppIcon name="arrow-left" color={colors.ink} size={23} />
          </TouchableOpacity>
          <View style={styles.stepPill}>
            <Text style={styles.stepText}>STEP 1 / 2</Text>
          </View>
        </View>

        <Text style={styles.eyebrow}>NEW RECEIPT</Text>
        <Text style={styles.title}>What arrived?</Text>
        <Text style={styles.subtitle}>Tap the vehicle type. The parking fee is fixed and cannot be changed.</Text>

        <View style={styles.cards}>
          {OPTIONS.map(option => (
            <VehicleCard
              key={option.vehicle}
              {...option}
              active={selectedVehicle === option.vehicle}
              onPress={() => onContinue(option.vehicle)}
            />
          ))}
        </View>

        <Text style={styles.footnote}>Your selection opens plate entry immediately.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30 },
  back: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepPill: { backgroundColor: colors.cobaltSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  stepText: { color: colors.cobalt, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  eyebrow: { color: colors.mintText, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 36, lineHeight: 42, fontWeight: '900', letterSpacing: -1, marginTop: 8 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 24, maxWidth: 340 },
  cards: { gap: 14 },
  card: { backgroundColor: colors.blueSurface, borderRadius: radius.large, borderWidth: 1, borderColor: '#C9DCFF', padding: 20, minHeight: 205, ...surfaceShadow },
  cardActive: { borderColor: colors.cobalt },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vehicleCode: { width: 48, height: 48, backgroundColor: colors.ink, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  vehicleCodeActive: { backgroundColor: colors.cobalt },
  cardTitle: { color: colors.ink, fontSize: 26, fontWeight: '900', marginTop: 18 },
  cardNote: { color: colors.muted, fontSize: 13, marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  priceLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, paddingBottom: 4 },
  price: { color: colors.cobalt, fontSize: 24, fontWeight: '900' },
  footnote: { color: colors.muted, textAlign: 'center', fontSize: 12, fontWeight: '600', marginTop: 'auto', paddingTop: 18 },
});
