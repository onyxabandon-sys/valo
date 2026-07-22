import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ticket } from '../types';

type Props = {
  tickets: Ticket[];
  report?: {
    count: number;
    revenue: number;
  } | null;
  reportTickets?: Ticket[];
  onBack: () => void;
  onExport?: () => void | Promise<void>;
};

export function ReportScreen({ tickets, report, reportTickets, onBack, onExport }: Props) {
  const totals = useMemo(() => {
    if (report) {
      return { count: report.count, amount: report.revenue };
    }
    const amount = tickets.reduce((sum, ticket) => sum + ticket.amount, 0);
    return { count: tickets.length, amount };
  }, [report, tickets]);
  const rows = reportTickets ?? tickets;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>Summary</Text>
        <Text style={styles.title}>Daily report</Text>
        <Text style={styles.subtitle}>Track the number of check-ins and collected amount.</Text>

        <View style={styles.statsRow}>
          <Stat label="Tickets" value={`${totals.count}`} />
          <Stat label="Revenue" value={`Rs. ${totals.amount.toFixed(2)}`} />
        </View>

        <View style={styles.listCard}>
          {rows.map(ticket => (
            <View style={styles.ticketRow} key={ticket.id}>
              <View>
                <Text style={styles.ticketNo}>{ticket.ticketNumber}</Text>
                <Text style={styles.ticketMeta}>{ticket.vehicleNumber}</Text>
              </View>
              <Text style={styles.ticketAmount}>Rs. {ticket.amount.toFixed(2)}</Text>
            </View>
          ))}
          {rows.length === 0 && <Text style={styles.empty}>No tickets available.</Text>}
        </View>

        <TouchableOpacity style={styles.button} onPress={onBack} activeOpacity={0.9}>
          <Text style={styles.buttonText}>Back</Text>
        </TouchableOpacity>
        {onExport ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={onExport} activeOpacity={0.9}>
            <Text style={styles.secondaryButtonText}>Export report</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A' },
  container: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, gap: 14 },
  kicker: { color: '#93C5FD', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900' },
  subtitle: { color: '#CBD5E1', fontSize: 15, lineHeight: 21 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18 },
  statLabel: { color: '#64748B', fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  statValue: { color: '#0F172A', fontSize: 20, fontWeight: '900', marginTop: 8 },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    padding: 16,
    shadowColor: '#020617',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
  ticketRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  ticketNo: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  ticketMeta: { fontSize: 13, color: '#64748B', marginTop: 4 },
  ticketAmount: { fontSize: 15, fontWeight: '800', color: '#2563EB' },
  empty: { color: '#64748B', paddingVertical: 20, textAlign: 'center' },
  button: { backgroundColor: '#2563EB', borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  secondaryButtonText: { color: '#0F172A', fontWeight: '800', fontSize: 17 },
});
