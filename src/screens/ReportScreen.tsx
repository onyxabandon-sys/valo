import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../ui/AppIcon';

export type ReportSnapshot = {
  _id: string;
  reportDate: string;
  startAt?: number;
  endAt?: number;
  generatedAt: number;
  printedReceiptCount?: number;
  receiptCount: number;
  cashRevenue: number;
};

type Props = {
  snapshots: ReportSnapshot[];
  historyStatus: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';
  onLoadMore: () => void;
  onCreateSnapshot: () => Promise<{ _id: string; reportDate: string }>;
  onBack: () => void;
};

export function ReportScreen({ snapshots, historyStatus, onLoadMore, onCreateSnapshot, onBack }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => parseDateKey(snapshots[0]?.reportDate ?? formatDateKey(new Date())));
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(snapshots[0]?._id ?? null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const selectedSnapshot = snapshots.find(snapshot => snapshot._id === selectedSnapshotId) ?? snapshots[0] ?? null;
  const selectedDate = selectedSnapshot?.reportDate ?? formatDateKey(new Date());
  const daysWithSnapshots = useMemo(() => {
    const byDate = new Map<string, ReportSnapshot>();
    for (const snapshot of snapshots) {
      if (!byDate.has(snapshot.reportDate)) byDate.set(snapshot.reportDate, snapshot);
    }
    return byDate;
  }, [snapshots]);
  const monthDays = getCalendarDays(calendarMonth);
  const todayKey = formatDateKey(new Date());

  const createSnapshot = async () => {
    if (creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const snapshot = await onCreateSnapshot();
      setSelectedSnapshotId(snapshot._id);
      setCalendarMonth(parseDateKey(snapshot.reportDate));
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'The report could not be saved. Check your connection and retry.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>Reports</Text>
            <Text style={styles.title}>Last 24 hours</Text>
            <Text style={styles.subtitle}>Save a fixed report when you need it. Earlier reports stay available in the calendar.</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Choose a saved report date"
            accessibilityState={{ expanded: calendarOpen }}
            style={styles.calendarButton}
            onPress={() => {
              setCalendarMonth(parseDateKey(selectedDate));
              setCalendarOpen(value => !value);
            }}
          >
            <AppIcon name="calendar-month-outline" color="#0F172A" size={22} />
          </TouchableOpacity>
        </View>

        {calendarOpen ? (
          <View style={styles.calendar}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                style={styles.monthArrow}
                onPress={() => setCalendarMonth(new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() - 1, 1)))}
              >
                <AppIcon name="chevron-left" color="#0F172A" size={22} />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>{formatMonth(calendarMonth)}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Next month"
                disabled={calendarMonth.getUTCFullYear() > new Date().getUTCFullYear() || (calendarMonth.getUTCFullYear() === new Date().getUTCFullYear() && calendarMonth.getUTCMonth() >= new Date().getUTCMonth())}
                style={styles.monthArrow}
                onPress={() => setCalendarMonth(new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + 1, 1)))}
              >
                <AppIcon name="chevron-right" color={calendarMonth.getUTCFullYear() > new Date().getUTCFullYear() || (calendarMonth.getUTCFullYear() === new Date().getUTCFullYear() && calendarMonth.getUTCMonth() >= new Date().getUTCMonth()) ? '#CBD5E1' : '#0F172A'} size={22} />
              </TouchableOpacity>
            </View>
            <View style={styles.calendarGrid}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <Text style={styles.weekday} key={`${day}-${index}`}>{day}</Text>
              ))}
              {monthDays.map((day, index) => {
                if (!day) return <View style={styles.dayCell} key={`empty-${index}`} />;
                const dayKey = formatDateKey(day);
                const snapshot = daysWithSnapshots.get(dayKey);
                const isSelected = snapshot?._id === selectedSnapshot?._id;
                const isFuture = dayKey > todayKey;
                return (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`${formatDate(dayKey)}${snapshot ? ', saved report' : ', no saved report'}`}
                    accessibilityState={{ selected: isSelected, disabled: isFuture || !snapshot }}
                    disabled={isFuture || !snapshot}
                    style={[styles.dayCell, isSelected && styles.selectedDay, !snapshot && styles.emptyDay, isFuture && styles.futureDay]}
                    key={dayKey}
                    onPress={() => {
                      if (!snapshot) return;
                      setSelectedSnapshotId(snapshot._id);
                      setCalendarOpen(false);
                    }}
                  >
                    <Text style={[styles.dayText, isSelected && styles.selectedDayText, !snapshot && styles.emptyDayText]}>{day.getUTCDate()}</Text>
                    {snapshot && !isSelected ? <View style={styles.savedDot} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.calendarHint}>Days with a saved report have a blue dot.</Text>
          </View>
        ) : null}

        {selectedSnapshot ? (
          <>
            <View style={styles.windowCard}>
              <Text style={styles.windowLabel}>Saved window</Text>
              <Text style={styles.windowValue}>
                {formatTimestamp(selectedSnapshot.startAt ?? selectedSnapshot.generatedAt - 24 * 60 * 60_000)}
                {'  –  '}
                {formatTimestamp(selectedSnapshot.endAt ?? selectedSnapshot.generatedAt)}
              </Text>
            </View>
            <View style={styles.statsRow}>
              <Stat label="Printed receipts" value={`${selectedSnapshot.printedReceiptCount ?? selectedSnapshot.receiptCount}`} />
              <Stat label="Total collected" value={`Rs. ${selectedSnapshot.cashRevenue.toFixed(2)}`} />
            </View>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <AppIcon name="chart-box-outline" color="#64748B" size={28} />
            <Text style={styles.emptyTitle}>{historyStatus === 'LoadingFirstPage' ? 'Loading saved reports' : 'No saved report yet'}</Text>
            <Text style={styles.emptyText}>Create a report to save the printed receipts from the 24 hours before you tap the button.</Text>
          </View>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          disabled={creating || historyStatus === 'LoadingFirstPage'}
          style={[styles.button, (creating || historyStatus === 'LoadingFirstPage') && styles.buttonDisabled]}
          onPress={createSnapshot}
          activeOpacity={0.9}
        >
          {creating ? <ActivityIndicator color="#FFFFFF" size="small" /> : <AppIcon name="content-save-outline" color="#FFFFFF" size={22} />}
          <Text style={styles.buttonText}>{creating ? 'Saving 24-hour report…' : 'Save 24-hour report'}</Text>
        </TouchableOpacity>
        {createError ? <Text accessibilityRole="alert" style={styles.error}>{createError}</Text> : null}

        {historyStatus === 'CanLoadMore' || historyStatus === 'LoadingMore' ? (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={historyStatus === 'LoadingMore'}
            style={styles.moreButton}
            onPress={onLoadMore}
            activeOpacity={0.85}
          >
            {historyStatus === 'LoadingMore' ? <ActivityIndicator color="#0F172A" size="small" /> : null}
            <Text style={styles.moreButtonText}>{historyStatus === 'LoadingMore' ? 'Loading saved reports…' : 'Load earlier reports'}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.secondaryButton} onPress={onBack} activeOpacity={0.9}>
          <AppIcon name="arrow-left" color="#0F172A" size={21} />
          <Text style={styles.secondaryButtonText}>Back to home</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function formatMonth(value: Date) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(parseDateKey(value));
}

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getCalendarDays(month: Date) {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const count = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  return [
    ...Array<null>(first.getUTCDay()).fill(null),
    ...Array.from({ length: count }, (_, index) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), index + 1))),
  ];
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
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 150, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, gap: 4 },
  kicker: { color: '#2563EB', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: '#0F172A', fontSize: 30, fontWeight: '900' },
  subtitle: { color: '#64748B', fontSize: 15, lineHeight: 21 },
  calendarButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, backgroundColor: '#FFFFFF' },
  calendar: { padding: 14, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 18, backgroundColor: '#FFFFFF', gap: 8 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthArrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', textAlign: 'center', color: '#64748B', fontSize: 12, fontWeight: '700', paddingVertical: 8 },
  dayCell: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  dayText: { color: '#0F172A', fontSize: 14, fontWeight: '600' },
  selectedDay: { backgroundColor: '#2563EB' },
  selectedDayText: { color: '#FFFFFF', fontWeight: '800' },
  emptyDay: { opacity: 0.62 },
  emptyDayText: { color: '#94A3B8' },
  futureDay: { opacity: 0.45 },
  savedDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#2563EB', position: 'absolute', bottom: 5 },
  calendarHint: { color: '#64748B', fontSize: 12, textAlign: 'center', paddingTop: 3 },
  windowCard: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  windowLabel: { color: '#64748B', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  windowValue: { color: '#0F172A', fontSize: 15, lineHeight: 22, fontWeight: '700', marginTop: 5 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  statLabel: { color: '#64748B', fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase' },
  statValue: { color: '#0F172A', fontSize: 20, fontWeight: '900', marginTop: 8 },
  emptyCard: { alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 24, gap: 10 },
  emptyTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: '#64748B', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  button: { minHeight: 56, flexDirection: 'row', gap: 9, backgroundColor: '#2563EB', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.72 },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
  error: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, fontWeight: '600', lineHeight: 20 },
  moreButton: { minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1' },
  moreButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '700' },
  secondaryButton: { backgroundColor: '#FFFFFF', borderRadius: 18, minHeight: 56, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBD5E1' },
  secondaryButtonText: { color: '#0F172A', fontWeight: '800', fontSize: 17 },
});
