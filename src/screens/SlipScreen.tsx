import React from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ticket } from '../types';

type Props = {
  ticket: Ticket;
  onPrint: () => void;
  onNewSale: () => void;
};

export function SlipScreen({ ticket, onPrint, onNewSale }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.title}>Slip</Text>
        <Text style={styles.value}>{ticket.ticketNumber}</Text>
        <Text style={styles.value}>{ticket.vehicleNumber}</Text>
        <TouchableOpacity onPress={onPrint} style={styles.button}>
          <Text style={styles.buttonText}>Print</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onNewSale} style={styles.secondary}>
          <Text style={styles.secondaryText}>New Sale</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F7F9FF' },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 24, gap: 10 },
  title: { fontSize: 28, fontWeight: '700' },
  value: { fontSize: 16, color: '#334155' },
  button: { marginTop: 16, backgroundColor: '#1753F0', padding: 14, borderRadius: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondary: { padding: 14, borderRadius: 14, alignItems: 'center' },
  secondaryText: { color: '#1753F0', fontWeight: '700' },
});
