import React from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { User } from '../types';

type Props = {
  user: User;
  onLogout: () => void;
};

export function ProfileScreen({ user, onLogout }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <View style={styles.avatar} />
          <Text style={styles.title}>{user.name}</Text>
          <Text style={styles.subtitle}>{user.role} · {user.locationName}</Text>
        </View>

        <View style={styles.card}>
          <Row label="Email" value={user.email} />
          <Row label="Employee ID" value={user.employeeId} />
          <Row label="Phone" value={user.phone} />
          <Row label="Joined" value={user.joinedAt} />
          <Row label="Status" value={user.status} />
        </View>

        <TouchableOpacity style={styles.logout} onPress={onLogout} activeOpacity={0.9}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A' },
  container: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, gap: 14 },
  hero: { alignItems: 'center', paddingVertical: 16 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#CBD5E1', marginBottom: 14 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#CBD5E1', fontSize: 15, marginTop: 6 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 30, paddingHorizontal: 18, paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  label: { color: '#64748B', fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  value: { color: '#0F172A', fontSize: 15, fontWeight: '800', maxWidth: '60%', textAlign: 'right' },
  logout: { backgroundColor: '#DC2626', borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  logoutText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});

