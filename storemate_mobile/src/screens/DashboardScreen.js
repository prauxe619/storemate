import React from 'react';
import { SafeAreaView, Text, View, StyleSheet, ScrollView } from 'react-native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '../core/database';
import { Q } from '@nozbe/watermelondb';

const DashboardScreen = ({ ledgerEntries, sales }) => {
  let totalOutstanding = 0;
  ledgerEntries.forEach(e => {
    totalOutstanding += e.entryType === 'CREDIT' ? e.amount : -e.amount;
  });
  totalOutstanding = Math.max(totalOutstanding, 0);

  const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);

  // ✅ NEW: Today's revenue — mirrors the same "todaySales" calc HomeScreen
  // uses, so the two screens never disagree with each other.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaysSales = sales.filter(s => (s.createdAt || 0) >= today.getTime());
  const todaysRevenue = todaysSales.reduce((sum, s) => sum + s.totalAmount, 0);

  // ✅ NEW: Cash vs Khata split — both fields (paymentType, totalAmount)
  // already exist on every sales_transactions record from checkout.
  const cashSales = sales.filter(s => s.paymentType === 'CASH');
  const khataSales = sales.filter(s => s.paymentType === 'KHATA');
  const cashRevenue = cashSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const khataRevenue = khataSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const cashPct = totalRevenue > 0 ? Math.round((cashRevenue / totalRevenue) * 100) : 0;
  const khataPct = totalRevenue > 0 ? 100 - cashPct : 0;

  // ✅ NEW: Average sale value — useful at-a-glance number shopkeepers ask
  // accountants for; simple derived stat, no new data needed.
  const avgSale = sales.length > 0 ? totalRevenue / sales.length : 0;

  // ✅ NEW: how many distinct customers currently owe money — gives scale
  // to the outstanding-khata number beyond just a rupee figure.
  const debtorNames = new Set();
  const balanceByCustomer = {};
  ledgerEntries.forEach(e => {
    const key = e.customerId.trim().toLowerCase();
    balanceByCustomer[key] = (balanceByCustomer[key] || 0) + (e.entryType === 'CREDIT' ? e.amount : -e.amount);
  });
  Object.values(balanceByCustomer).forEach((bal, idx) => {
    if (bal > 0) debtorNames.add(idx);
  });
  const debtorCount = Object.values(balanceByCustomer).filter(bal => bal > 0).length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        <Text style={styles.header}>Business Overview</Text>
        <Text style={styles.headerHinglish}>Karobar ka Hisaab</Text>

        <View style={styles.cardRow}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>TOTAL REVENUE</Text>
            <Text style={[styles.cardValue, { color: '#0C9C4C' }]}>₹{totalRevenue.toLocaleString('en-IN')}</Text>
            <Text style={styles.cardSubtext}>{sales.length} completed sale{sales.length !== 1 ? 's' : ''}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>OUTSTANDING KHATA</Text>
            <Text style={[styles.cardValue, { color: '#E0433B' }]}>₹{totalOutstanding.toLocaleString('en-IN')}</Text>
            <Text style={styles.cardSubtext}>
              {debtorCount > 0 ? `Owed by ${debtorCount} customer${debtorCount !== 1 ? 's' : ''}` : 'Nobody owes you right now'}
            </Text>
          </View>
        </View>

        <View style={styles.cardRow}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>TODAY'S REVENUE</Text>
            <Text style={styles.cardValueSmall}>₹{todaysRevenue.toLocaleString('en-IN')}</Text>
            <Text style={styles.cardSubtext}>{todaysSales.length} sale{todaysSales.length !== 1 ? 's' : ''} today</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>AVG SALE VALUE</Text>
            <Text style={styles.cardValueSmall}>₹{avgSale.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
            <Text style={styles.cardSubtext}>Across all sales</Text>
          </View>
        </View>

        {/* Cash vs Khata split — only rendered once there's something to show */}
        {sales.length > 0 && (
          <View style={styles.splitCard}>
            <Text style={styles.cardTitle}>CASH VS KHATA</Text>
            <View style={styles.splitBarTrack}>
              <View style={[styles.splitBarFill, { width: `${cashPct}%`, backgroundColor: '#0C9C4C' }]} />
            </View>
            <View style={styles.splitLegendRow}>
              <View style={styles.splitLegendItem}>
                <View style={[styles.splitDot, { backgroundColor: '#0C9C4C' }]} />
                <Text style={styles.splitLegendText}>Cash · {cashPct}% · ₹{cashRevenue.toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.splitLegendItem}>
                <View style={[styles.splitDot, { backgroundColor: '#E0433B' }]} />
                <Text style={styles.splitLegendText}>Khata · {khataPct}% · ₹{khataRevenue.toLocaleString('en-IN')}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ---- Palette (matches the rest of the app) ----
// Background #F5F7F6   Card #FFFFFF   Ink #1B1F23   Muted #6B7280
// Brand Green #0C9C4C  Alert Red #E0433B  Hairline #EAECEC

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F6', padding: 20 },
  header: { fontSize: 24, color: '#1B1F23', fontWeight: '800', marginTop: 10 },
  headerHinglish: { color: '#9CA3AF', fontSize: 13, fontStyle: 'italic', marginTop: 2, marginBottom: 20 },

  cardRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: { flex: 1, backgroundColor: '#FFFFFF', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#EAECEC' },
  cardTitle: { color: '#6B7280', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  cardValue: { fontSize: 26, fontWeight: '800' },
  cardValueSmall: { fontSize: 20, fontWeight: '800', color: '#1B1F23' },
  cardSubtext: { color: '#9CA3AF', fontSize: 11.5, marginTop: 8 },

  splitCard: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#EAECEC', marginTop: 4 },
  splitBarTrack: { height: 10, borderRadius: 5, backgroundColor: '#FDECEA', overflow: 'hidden', marginTop: 4, marginBottom: 12 },
  splitBarFill: { height: '100%', borderRadius: 5 },
  splitLegendRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  splitLegendItem: { flexDirection: 'row', alignItems: 'center' },
  splitDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  splitLegendText: { color: '#374151', fontSize: 12.5, fontWeight: '600' },
});

const enhance = withObservables([], () => ({
  ledgerEntries: database.get('ledger_entries').query().observe(),
  sales: database.get('sales_transactions').query().observe(),
}));

export default enhance(DashboardScreen);