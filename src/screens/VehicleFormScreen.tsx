import React from 'react';
import { SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { VehicleType } from '../types';

type Props = {
  vehicleType: VehicleType;
  vehicleNumber: string;
  amount: string;
  locationName: string;
  error: string;
  onVehicleNumberChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
};

export function VehicleFormScreen({
  vehicleType,
  vehicleNumber,
  amount,
  locationName,
  error,
  onVehicleNumberChange,
  onAmountChange,
  onSubmit,
  onBack,
}: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.title}>{vehicleType}</Text>
        <Text style={styles.sub}>{locationName}</Text>
        <TextInput value={vehicleNumber} onChangeText={onVehicleNumberChange} style={styles.input} />
        <TextInput value={amount} onChangeText={onAmountChange} style={styles.input} keyboardType="numeric" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity onPress={onSubmit} style={styles.button}>
          <Text style={styles.buttonText}>Create</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onBack} style={styles.secondary}>
          <Text style={styles.secondaryText}>Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F7F9FF' },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 24, gap: 10 },
  title: { fontSize: 28, fontWeight: '700' },
  sub: { color: '#64748B' },
  input: { borderWidth: 1, borderColor: '#DCE2F0', borderRadius: 12, padding: 12 },
  error: { color: '#C2410C' },
  button: { marginTop: 16, backgroundColor: '#1753F0', padding: 14, borderRadius: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondary: { padding: 14, borderRadius: 14, alignItems: 'center' },
  secondaryText: { color: '#1753F0', fontWeight: '700' },
});
