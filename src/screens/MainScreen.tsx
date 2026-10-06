import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialDesignIconsIconName } from '@react-native-vector-icons/material-design-icons/static';
import { AppIcon } from '../ui/AppIcon';
import { colors, radius, surfaceShadow } from '../ui/tokens';
import { User } from '../types';

type Props = {
  user: User;
  onCheckIn: () => void;
  onHistory: () => void;
  onLookup: () => void;
};

function ToolCard({ label, detail, icon, onPress }: { label: string; detail: string; icon: MaterialDesignIconsIconName; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.toolCard} onPress={onPress} activeOpacity={0.84} accessibilityRole="button">
      <View style={styles.toolMarker}>
        <AppIcon name={icon} color={colors.cobalt} size={22} />
      </View>
      <View style={styles.toolCopy}>
        <Text style={styles.toolLabel}>{label}</Text>
        <Text style={styles.toolDetail}>{detail}</Text>
      </View>
      <AppIcon name="chevron-right" color={colors.muted} size={22} />
    </TouchableOpacity>
  );
}

export function MainScreen({ user, onCheckIn, onHistory, onLookup }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.blueOrbTop} />
        <View style={styles.blueOrbBottom} />
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>VALET / POS</Text>
            <Text style={styles.location}>{user.locationName}</Text>
          </View>
        </View>

        <View style={styles.welcomeRow}>
          <View style={styles.welcomeCopy}>
            <Text style={styles.eyebrow}>OPERATOR READY</Text>
            <Text style={styles.title}>Good to see you,{`\n`}{user.name.split(' ')[0]}.</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryAction} onPress={onCheckIn} activeOpacity={0.9} accessibilityRole="button">
          <View style={styles.primaryTopRow}>
            <Text style={styles.primaryKicker}>FAST CHECK-IN</Text>
            <View style={styles.primaryArrowWrap}>
              <AppIcon name="arrow-right" color={colors.cobalt} size={23} />
            </View>
          </View>
          <Text style={styles.primaryTitle}>Create a receipt</Text>
          <Text style={styles.primaryDetail}>Bike Rs. 50  |  Car Rs. 100</Text>
          <View style={styles.primaryRule} />
          <Text style={styles.primaryFoot}>Select vehicle, enter plate, print.</Text>
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tools</Text>
          <Text style={styles.sectionHint}>Everything else</Text>
        </View>

        <View style={styles.tools}>
          <ToolCard label="Daily report" detail="Receipts, totals and export" icon="chart-box-outline" onPress={onHistory} />
          <ToolCard label="Receipt lookup" detail="Find by barcode or receipt ID" icon="barcode-scan" onPress={onLookup} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 112 },
  blueOrbTop: { position: 'absolute', top: -80, right: -60, width: 190, height: 190, borderRadius: 95, backgroundColor: colors.blueCanvasDeep, opacity: 0.9 },
  blueOrbBottom: { position: 'absolute', bottom: 170, left: -90, width: 210, height: 210, borderRadius: 105, backgroundColor: '#DCEBFF', opacity: 0.7 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  brand: { color: colors.cobalt, fontSize: 12, fontWeight: '900', letterSpacing: 1.8 },
  location: { color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 4 },
  welcomeRow: { gap: 14, marginBottom: 22 },
  welcomeCopy: { flex: 1 },
  eyebrow: { color: colors.mintText, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginBottom: 7 },
  title: { color: colors.ink, fontSize: 34, lineHeight: 39, fontWeight: '900', letterSpacing: -0.8 },
  primaryAction: { backgroundColor: colors.cobaltDeep, borderRadius: radius.large, padding: 22, minHeight: 238, ...surfaceShadow },
  primaryTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  primaryKicker: { color: '#DCE7FF', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  primaryArrowWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  primaryTitle: { color: colors.surface, fontSize: 31, fontWeight: '900', letterSpacing: -0.6, marginTop: 24 },
  primaryDetail: { color: '#DCE7FF', fontSize: 16, fontWeight: '700', marginTop: 9 },
  primaryRule: { height: 1, backgroundColor: 'rgba(255,255,255,0.26)', marginTop: 28, marginBottom: 14 },
  primaryFoot: { color: colors.surface, fontSize: 13, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 28, marginBottom: 12 },
  sectionTitle: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  sectionHint: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  tools: { gap: 10 },
  toolCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.medium, padding: 14, borderWidth: 1, borderColor: colors.line },
  toolMarker: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.cobaltSoft, alignItems: 'center', justifyContent: 'center' },
  toolCopy: { flex: 1, marginLeft: 13 },
  toolLabel: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  toolDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
