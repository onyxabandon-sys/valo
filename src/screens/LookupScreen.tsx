import React from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ticket } from '../types';

type Props = {
  query: string;
  ticket: Ticket | null;
  source?: 'local' | 'convex';
  onQueryChange: (value: string) => void;
  onBack: () => void;
};

export function LookupScreen({ query, ticket, source = 'local', onQueryChange, onBack }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Search</Text>
        <Text style={styles.title}>Lookup ticket</Text>
        <Text style={styles.subtitle}>Enter or scan the barcode value to retrieve the slip details.</Text>

        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onQueryChange}
          placeholder="Scan or type ticket ID"
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
        />

        <View style={styles.resultCard}>
          {ticket ? (
            <>
              <Text style={styles.resultTitle}>{ticket.ticketNumber} ({source})</Text>
              <Text style={styles.resultLine}>{ticket.vehicleNumber}</Text>
              <Text style={styles.resultLine}>{ticket.vehicleType}</Text>
              <Text style={styles.resultAmount}>Rs. {ticket.amount.toFixed(2)}</Text>
            </>
          ) : (
            <>
              <Text style={styles.resultTitle}>No ticket found</Text>
              <Text style={styles.resultLine}>Try scanning again or check the ticket ID.</Text>
            </>
          )}
        </View>

        <TouchableOpacity style={styles.button} onPress={onBack} activeOpacity={0.9}>
          <Text style={styles.buttonText}>Back</Text>
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
  subtitle: { color: '#CBD5E1', fontSize: 15, lineHeight: 21 },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    padding: 20,
    minHeight: 180,
    justifyContent: 'center',
    shadowColor: '#020617',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
  resultTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', marginBottom: 10 },
  resultLine: { fontSize: 15, color: '#64748B', marginTop: 4 },
  resultAmount: { fontSize: 20, fontWeight: '900', color: '#2563EB', marginTop: 12 },
  button: { backgroundColor: '#2563EB', borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
});
