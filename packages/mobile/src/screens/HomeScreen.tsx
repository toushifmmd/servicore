import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

interface Visit {
  id: string;
  scheduled_date: string;
  status: string;
  notes: string | null;
  clients: { name: string; phone: string; address: string | null };
}

export function HomeScreen({ navigation }: any) {
  const { profile } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadVisits = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('service_visits')
      .select('*, clients(name, phone, address)')
      .eq('technician_id', profile.id)
      .order('scheduled_date', { ascending: true });
    setVisits(data || []);
  };

  useEffect(() => { loadVisits(); }, [profile]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadVisits();
    setRefreshing(false);
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'completed': return '#10b981';
      case 'in_progress': return '#f59e0b';
      default: return '#6366f1';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Visits</Text>
      <Text style={styles.subtitle}>{visits.length} assigned</Text>
      <FlatList
        data={visits}
        keyExtractor={(v) => v.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('VisitDetail', { visit: item })}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.clientName}>{item.clients?.name}</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
              </View>
            </View>
            <Text style={styles.address}>{item.clients?.address || 'No address'}</Text>
            <Text style={styles.date}>📅 {new Date(item.scheduled_date).toLocaleDateString('en-IN')}</Text>
            <Text style={styles.phone}>📞 {item.clients?.phone}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No visits assigned</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginTop: 16 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 16 },
  card: { backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#2a2a3e' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  clientName: { fontSize: 18, fontWeight: '600', color: '#fff' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  address: { fontSize: 14, color: '#aaa', marginBottom: 4 },
  date: { fontSize: 13, color: '#6366f1', marginBottom: 2 },
  phone: { fontSize: 13, color: '#888' },
  empty: { textAlign: 'center', color: '#666', marginTop: 40, fontSize: 16 },
});
