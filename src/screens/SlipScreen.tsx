import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../ui/AppIcon';
import { colors, fonts, radius, surfaceShadow } from '../ui/tokens';
import { Receipt } from '../types';

type Props = {
  receipt: Receipt;
  error: string;
  onPrint: () => void;
  onNewSale: () => void;
};

function DetailRow({ label, value, utility = false }: { label: string; value: string; utility?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, utility && styles.utilityValue]}>{value}</Text>
    </View>
  );
}

function formatIssuedDateTime(value: string) {
  const issuedAt = new Date(value);
  if (Number.isNaN(issuedAt.getTime())) {
    return { date: value, time: '' };
  }

  return {
    date: issuedAt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }),
    time: issuedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

export function SlipScreen({ receipt, error, onPrint, onNewSale }: Props) {
  const printed = receipt.printStatus === 'printed';
  const failed = receipt.printStatus === 'failed';
  const statusLabel = printed ? 'PRINTED' : failed ? 'PRINT NEEDS ATTENTION' : 'SAVED / PRINTING';
  const issued = formatIssuedDateTime(receipt.issuedAt);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={[styles.statusMark, failed ? styles.statusMarkFailed : null]}>
          <AppIcon name={failed ? 'alert-outline' : 'check-bold'} color={colors.surface} size={27} />
        </View>
        <Text style={styles.eyebrow}>{statusLabel}</Text>
        <Text style={styles.title}>Receipt ready.</Text>
        <Text style={styles.subtitle}>The record is saved. You can start the next check-in immediately.</Text>

        <View style={styles.receiptCard}>
          <View style={styles.receiptTop}>
            <View>
              <Text style={styles.receiptKicker}>CAR PARKING TICKET</Text>
              {receipt.organizationName ? <Text style={styles.organizationName}>{receipt.organizationName}</Text> : null}
            </View>
            <View style={styles.typePill}>
              <Text style={styles.typePillText}>{receipt.vehicleType.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.perforation} />

          <DetailRow label="Vehicle number" value={receipt.vehicleNumber} utility />
          <DetailRow label="Vehicle type" value={receipt.vehicleType} />
          <DetailRow label="Parking fee" value={`Rs. ${receipt.vehicleRate.toFixed(0)}`} />
          <DetailRow label="Issued date" value={issued.date} utility />
          {issued.time ? <DetailRow label="Issued time" value={issued.time} utility /> : null}

          <View style={styles.barcodeBox}>
            <Text style={styles.barcodeLabel}>BARCODE VALUE</Text>
            <Text style={styles.barcodeValue}>{receipt.barcodeValue}</Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorTitle}>Printer message</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity onPress={onNewSale} style={styles.primaryButton} activeOpacity={0.9}>
          <Text style={styles.primaryButtonText}>Create next receipt</Text>
          <View style={styles.primaryButtonArrow}><AppIcon name="arrow-right" color={colors.surface} size={21} /></View>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPrint} style={styles.secondaryButton} activeOpacity={0.85}>
          <AppIcon name="printer-outline" color={colors.ink} size={20} />
          <Text style={styles.secondaryButtonText}>{printed ? 'Reprint receipt' : 'Try printing again'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 30, alignItems: 'stretch' },
  statusMark: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  statusMarkFailed: { backgroundColor: colors.danger },
  eyebrow: { color: colors.mintText, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 36, lineHeight: 42, fontWeight: '900', letterSpacing: -1, marginTop: 7 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 20, maxWidth: 350 },
  receiptCard: { backgroundColor: colors.blueSurface, borderRadius: radius.large, padding: 20, borderWidth: 1, borderColor: '#C9DCFF', ...surfaceShadow },
  receiptTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  receiptKicker: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  organizationName: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 6, maxWidth: 250 },
  typePill: { backgroundColor: colors.cobaltSoft, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill },
  typePillText: { color: colors.cobalt, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  perforation: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#B9C2D0', marginVertical: 18 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 8, gap: 16 },
  detailLabel: { width: 108, color: colors.muted, fontSize: 12, fontWeight: '700' },
  detailValue: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '900', textAlign: 'right' },
  utilityValue: { fontFamily: fonts.utility, letterSpacing: 0.5 },
  barcodeBox: { backgroundColor: colors.porcelain, borderRadius: radius.small, paddingHorizontal: 12, paddingVertical: 14, marginTop: 14, alignItems: 'center' },
  barcodeLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  barcodeValue: { color: colors.ink, fontSize: 10, fontWeight: '800', fontFamily: fonts.utility, letterSpacing: 0.4, marginTop: 8, textAlign: 'center' },
  errorBox: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: '#F4B8B8', borderRadius: radius.medium, padding: 14, marginTop: 14 },
  errorTitle: { color: colors.danger, fontSize: 14, fontWeight: '900' },
  errorText: { color: '#9F3030', fontSize: 12, lineHeight: 17, marginTop: 3 },
  primaryButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cobalt, borderRadius: radius.medium, marginTop: 18, ...surfaceShadow },
  primaryButtonText: { color: colors.surface, fontSize: 16, fontWeight: '900' },
  primaryButtonArrow: { position: 'absolute', right: 20 },
  secondaryButton: { minHeight: 54, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.medium, marginTop: 10 },
  secondaryButtonText: { color: colors.ink, fontSize: 15, fontWeight: '900' },
});
