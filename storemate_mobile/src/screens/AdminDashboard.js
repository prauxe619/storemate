import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, SafeAreaView, Platform, TextInput, RefreshControl, Linking, Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'http://192.168.31.65:5050';

const AdminDashboard = ({ onClose }) => {
  const [users, setUsers] = useState([]);
  const [totalShops, setTotalShops] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // ✅ NEW: search + sort — the directory becomes unusable past a few dozen
  // shops without a way to find one and control the order.
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState('newest'); // 'newest' | 'oldest' | 'name'

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    try {
      setError(null);
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${BASE_URL}/api/v1/admin/users`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setUsers(data.users || []);
        setTotalShops(data.total_shops || 0);
      } else {
        setError(data.error || "Failed to load admin data");
      }
    } catch (err) {
      setError("Network error. Is the server running?");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // ✅ NEW: pull-to-refresh instead of only loading once on mount
  const onRefresh = () => {
    setIsRefreshing(true);
    fetchAdminData();
  };

  // ✅ NEW: quick data-quality signal — how many shops are missing a phone
  // number, since that field silently blocks WhatsApp reminders/receipts.
  const usersWithPhone = users.filter(u => !!u.phone).length;
  const phoneCompletionPct = users.length > 0 ? Math.round((usersWithPhone / users.length) * 100) : 0;

  const visibleUsers = useMemo(() => {
    let list = [...users];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(u =>
        (u.shop_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').includes(q)
      );
    }

    if (sortMode === 'name') {
      list.sort((a, b) => (a.shop_name || '').localeCompare(b.shop_name || ''));
    } else if (sortMode === 'oldest') {
      list.sort((a, b) => a.id - b.id);
    } else {
      list.sort((a, b) => b.id - a.id); // newest first, assumes incrementing id
    }

    return list;
  }, [users, searchQuery, sortMode]);

  // ✅ NEW: tap a user's email/phone to act on it directly instead of just
  // reading it off the screen.
  const handleEmailPress = (email) => {
    if (!email) return;
    Linking.openURL(`mailto:${email}`).catch(() => Alert.alert("Error", "Could not open mail app."));
  };

  const handlePhonePress = (phone) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert("Error", "Could not open dialer."));
  };

  const renderUserCard = ({ item }) => (
    <View style={styles.userCard}>
      <View style={styles.userCardHeader}>
        <View style={styles.shopAvatar}>
          <Text style={styles.shopAvatarText}>{(item.shop_name || '?').trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.shopName}>{item.shop_name}</Text>
          <Text style={styles.userId}>#{item.id}</Text>
        </View>
      </View>

      <TouchableOpacity onPress={() => handleEmailPress(item.email)} activeOpacity={0.6}>
        <Text style={styles.userDetail}>✉️ {item.email}</Text>
      </TouchableOpacity>

      {item.phone ? (
        <TouchableOpacity onPress={() => handlePhonePress(item.phone)} activeOpacity={0.6}>
          <Text style={styles.userDetail}>📞 {item.phone}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.userDetailMissing}>📞 No phone on file</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>👑 Super Admin</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#B7791F" style={{ marginTop: 50 }} />
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchAdminData} activeOpacity={0.85}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Metrics row — total shops + a data-quality signal, both derived
              from data the API already returns (no invented fields). */}
          <View style={styles.metricsRow}>
            <View style={styles.metricsCard}>
              <Text style={styles.metricsTitle}>TOTAL SHOPS</Text>
              <Text style={styles.metricsValue}>{totalShops}</Text>
            </View>
            <View style={styles.metricsCard}>
              <Text style={styles.metricsTitle}>HAVE A PHONE</Text>
              <Text style={[styles.metricsValue, { color: phoneCompletionPct < 50 ? '#E0433B' : '#0C9C4C' }]}>
                {phoneCompletionPct}%
              </Text>
            </View>
          </View>

          {/* Search */}
          <TextInput
            style={styles.searchInput}
            placeholder="Search by shop, email or phone"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          {/* Sort toggle */}
          <View style={styles.sortRow}>
            {[
              { key: 'newest', label: 'Newest' },
              { key: 'oldest', label: 'Oldest' },
              { key: 'name', label: 'A–Z' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.sortChip, sortMode === opt.key && styles.sortChipActive]}
                onPress={() => setSortMode(opt.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.sortChipText, sortMode === opt.key && styles.sortChipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.listTitle}>
            User Directory {searchQuery ? `· ${visibleUsers.length} match${visibleUsers.length === 1 ? '' : 'es'}` : ''}
          </Text>

          <FlatList
            data={visibleUsers}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderUserCard}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#0C9C4C" colors={['#0C9C4C']} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🔍</Text>
                <Text style={styles.emptyText}>No shops match "{searchQuery}"</Text>
              </View>
            }
          />
        </>
      )}
    </SafeAreaView>
  );
};

// ---- Palette (matches the rest of the app) ----
// Background #F5F7F6   Card #FFFFFF   Ink #1B1F23   Muted #6B7280
// Brand Green #0C9C4C  Alert Red #E0433B  Hairline #EAECEC
// Admin accent Amber #B7791F — kept distinct from the routine green actions
// elsewhere in the app since this whole screen is a privileged area.

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F6', padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 10 },
  header: { fontSize: 22, color: '#B7791F', fontWeight: '800' },
  closeBtn: { backgroundColor: '#FFFFFF', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#EAECEC' },
  closeBtnText: { color: '#1B1F23', fontWeight: '600' },

  errorBox: { backgroundColor: '#FDECEA', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#F7C9C4', alignItems: 'center' },
  errorText: { color: '#E0433B', fontSize: 15, textAlign: 'center', fontWeight: '600', marginBottom: 14 },
  retryBtn: { backgroundColor: '#E0433B', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700' },

  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  metricsCard: { flex: 1, backgroundColor: '#FFFFFF', padding: 18, borderRadius: 14, borderWidth: 1, borderColor: '#EAECEC', alignItems: 'center' },
  metricsTitle: { color: '#6B7280', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  metricsValue: { color: '#1B1F23', fontSize: 30, fontWeight: '800' },

  searchInput: { backgroundColor: '#FFFFFF', color: '#1B1F23', padding: 13, borderRadius: 10, borderWidth: 1, borderColor: '#EAECEC', marginBottom: 12, fontSize: 14 },

  sortRow: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  sortChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EAECEC' },
  sortChipActive: { backgroundColor: '#1B1F23', borderColor: '#1B1F23' },
  sortChipText: { color: '#6B7280', fontSize: 12.5, fontWeight: '600' },
  sortChipTextActive: { color: '#FFFFFF' },

  listTitle: { color: '#6B7280', fontSize: 13, fontWeight: '700', marginBottom: 12 },

  userCard: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#EAECEC', marginBottom: 12 },
  userCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  shopAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF6E5', alignItems: 'center', justifyContent: 'center' },
  shopAvatarText: { color: '#B7791F', fontWeight: '800', fontSize: 16 },
  shopName: { color: '#1B1F23', fontSize: 16, fontWeight: '700' },
  userId: { color: '#9CA3AF', fontSize: 11, marginTop: 1, fontWeight: '600' },
  userDetail: { color: '#374151', fontSize: 13.5, marginBottom: 4 },
  userDetailMissing: { color: '#9CA3AF', fontSize: 13.5, marginBottom: 4, fontStyle: 'italic' },

  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 34, marginBottom: 10 },
  emptyText: { color: '#6B7280', fontSize: 14 },
});

export default AdminDashboard;