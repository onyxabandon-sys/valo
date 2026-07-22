import React from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { User } from '../types';

type Props = {
  user: User;
  onCheckIn: () => void;
  onProfile: () => void;
  onHistory: () => void;
  onLookup: () => void;
};

function MenuCard({
  title,
  subtitle,
  accent,
  onPress,
}: {
  title: string;
  subtitle: string;
  accent: 'blue' | 'slate' | 'emerald' | 'amber';
  onPress: () => void;
}) {
  const accents = {
    blue: { card: styles.cardBlue, icon: styles.iconBlue, title: styles.titleBlue },
    slate: { card: styles.cardSlate, icon: styles.iconSlate, title: styles.titleSlate },
    emerald: { card: styles.cardEmerald, icon: styles.iconEmerald, title: styles.titleEmerald },
    amber: { card: styles.cardAmber, icon: styles.iconAmber, title: styles.titleAmber },
  }[accent];

  const glyph = {
    blue: '▣',
    slate: '◫',
    emerald: '↺',
    amber: '⌁',
  }[accent];

  return (
    <TouchableOpacity style={[styles.menuCard, accents.card]} onPress={onPress} activeOpacity={0.9}>
      <View style={[styles.menuIcon, accents.icon]}>
        <Text style={[styles.menuIconText]}>{glyph}</Text>
      </View>
      <Text style={[styles.menuTitle, accents.title]}>{title}</Text>
      <Text style={styles.menuSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

export function MainScreen({ user, onCheckIn, onProfile, onHistory, onLookup }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.backdropTop} />
      <View style={styles.backdropBottom} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar} />
            <View style={styles.onlineDot} />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>Welcome back</Text>
            <Text style={styles.name}>{user.name}</Text>
            <View style={styles.locationRow}>
              <Text style={styles.locationPin}>⌖</Text>
              <Text style={styles.location}>{user.locationAddress}</Text>
            </View>
          </View>
          <View style={styles.bellWrap}>
            <Text style={styles.bell}>🔔</Text>
            <View style={styles.bellBadge} />
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Main Menu</Text>
            <Text style={styles.panelSubtitle}>Choose an action to continue</Text>
          </View>

          <View style={styles.grid}>
            <MenuCard title="Check-in" subtitle="Scan QR and issue a ticket" accent="blue" onPress={onCheckIn} />
            <MenuCard title="My Assets" subtitle="Review assigned details" accent="slate" onPress={onProfile} />
            <MenuCard title="History" subtitle="Open recent activity" accent="emerald" onPress={onHistory} />
            <MenuCard title="Lookup" subtitle="Search by ticket ID" accent="amber" onPress={onLookup} />
          </View>
        </View>

        <View style={styles.notice}>
          <View style={styles.noticeBadge}>
            <Text style={styles.noticeBadgeText}>✓</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Secure and Reliable</Text>
            <Text style={styles.noticeBody}>All check-ins are recorded locally and synced when connectivity returns.</Text>
          </View>
          <Text style={styles.chevron}>{'>'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EEF2FF' },
  backdropTop: {
    position: 'absolute',
    top: -80,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(37, 99, 235, 0.14)',
  },
  backdropBottom: {
    position: 'absolute',
    right: -90,
    bottom: 120,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(16, 185, 129, 0.10)',
  },
  container: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, gap: 18 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 28,
    backgroundColor: '#0F172A',
  },
  avatarWrap: { width: 68, height: 68, position: 'relative' },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#CBD5E1' },
  onlineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#22C55E',
    position: 'absolute',
    right: 1,
    bottom: 2,
    borderWidth: 3,
    borderColor: '#0F172A',
  },
  heroText: { flex: 1 },
  kicker: { fontSize: 13, letterSpacing: 0.7, color: '#94A3B8', textTransform: 'uppercase' },
  name: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', lineHeight: 32, marginTop: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  locationPin: { fontSize: 17, color: '#93C5FD' },
  location: { fontSize: 15, color: '#CBD5E1', flexShrink: 1 },
  bellWrap: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  bell: { fontSize: 28 },
  bellBadge: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FB7185', position: 'absolute', top: 5, right: 5 },
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 5,
  },
  panelHeader: { marginBottom: 16 },
  panelTitle: { fontSize: 30, fontWeight: '800', color: '#111827' },
  panelSubtitle: { fontSize: 15, color: '#64748B', marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  menuCard: {
    width: '48%',
    minHeight: 212,
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardBlue: { backgroundColor: '#F8FBFF', borderColor: '#C7DBFF' },
  cardSlate: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  cardEmerald: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  cardAmber: { backgroundColor: '#FFF9ED', borderColor: '#FDE68A' },
  menuIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconBlue: { backgroundColor: '#2563EB' },
  iconSlate: { backgroundColor: '#334155' },
  iconEmerald: { backgroundColor: '#16A34A' },
  iconAmber: { backgroundColor: '#D97706' },
  menuIconText: { fontSize: 32, fontWeight: '800', color: '#FFFFFF' },
  menuTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  titleBlue: { color: '#2563EB' },
  titleSlate: { color: '#0F172A' },
  titleEmerald: { color: '#15803D' },
  titleAmber: { color: '#B45309' },
  menuSubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 18 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  noticeBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  noticeBadgeText: { color: '#16A34A', fontWeight: '800', fontSize: 20 },
  noticeTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  noticeBody: { fontSize: 13, color: '#CBD5E1', marginTop: 4, lineHeight: 18 },
  chevron: { fontSize: 28, color: '#94A3B8' },
});
