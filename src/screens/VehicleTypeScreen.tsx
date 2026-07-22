import React from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { VehicleType } from '../types';
import { VEHICLE_RATES } from '../data/seed';

type Props = {
  selectedVehicle: VehicleType;
  onContinue: (vehicle: VehicleType) => void;
  onBack: () => void;
};

const OPTIONS: { vehicle: VehicleType; label: string; desc: string; icon: string }[] = [
  { vehicle: 'Bike', label: 'Bike', desc: 'Compact parking slot', icon: '◌' },
  { vehicle: 'Car', label: 'Car', desc: 'Standard sedan entry', icon: '▣' },
  { vehicle: 'Commercial Vehicle', label: 'Commercial Vehicle', desc: 'Load-bearing access', icon: '⌂' },
  { vehicle: 'Bus', label: 'Bus', desc: 'Passenger shuttle', icon: '▤' },
  { vehicle: 'Heavy Vehicle', label: 'Heavy Vehicle', desc: 'Oversized lane access', icon: '▦' },
  { vehicle: 'Tractor', label: 'Tractor', desc: 'Utility vehicle', icon: '◫' },
];

function VehicleCard({ vehicle, active, onPress }: { vehicle: VehicleType; active: boolean; onPress: () => void }) {
  const meta = OPTIONS.find(item => item.vehicle === vehicle)!;
  return (
    <TouchableOpacity style={[styles.card, active && styles.cardActive]} onPress={onPress} activeOpacity={0.9}>
      <View style={[styles.icon, active && styles.iconActive]}>
        <Text style={[styles.iconText, active && styles.iconTextActive]}>{meta.icon}</Text>
      </View>
      <Text style={[styles.cardTitle, active && styles.cardTitleActive]}>{meta.label}</Text>
      <Text style={styles.cardDesc}>{meta.desc}</Text>
      <Text style={styles.price}>Rs. {VEHICLE_RATES[vehicle].toFixed(2)}</Text>
    </TouchableOpacity>
  );
}

export function VehicleTypeScreen({ selectedVehicle, onContinue, onBack }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>Step 1 of 2</Text>
        <Text style={styles.title}>Select vehicle type</Text>
        <Text style={styles.subtitle}>Choose the vehicle class before generating the entry slip.</Text>

        <View style={styles.grid}>
          {OPTIONS.map(option => (
            <VehicleCard key={option.vehicle} vehicle={option.vehicle} active={selectedVehicle === option.vehicle} onPress={() => onContinue(option.vehicle)} />
          ))}
        </View>

        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.9}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A' },
  container: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, gap: 14 },
  kicker: { color: '#93C5FD', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900' },
  subtitle: { color: '#CBD5E1', fontSize: 15, lineHeight: 21, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  card: {
    width: '48%',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 16,
    minHeight: 188,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
  },
  cardActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  icon: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  iconActive: { backgroundColor: '#2563EB' },
  iconText: { fontSize: 22, fontWeight: '800', color: '#475569' },
  iconTextActive: { color: '#FFFFFF' },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  cardTitleActive: { color: '#2563EB' },
  cardDesc: { fontSize: 12, color: '#64748B', lineHeight: 17, marginTop: 6 },
  price: { marginTop: 10, fontSize: 14, fontWeight: '800', color: '#0F172A' },
  backButton: { alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, marginTop: 4 },
  backButtonText: { color: '#CBD5E1', fontSize: 15, fontWeight: '700' },
});

