import React, { useState, useEffect } from 'react';
import { SafeAreaView, View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { database } from '../core/database';
import { Q } from '@nozbe/watermelondb';

const AnalyticsScreen = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  
  // Metrics
  const [thisMonthSales, setThisMonthSales] = useState(0);
  const [allTimeSales, setAllTimeSales] = useState(0);
  const [totalUdhaar, setTotalUdhaar] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);
  const [stockInvestment, setStockInvestment] = useState(0);
  const [expectedStockRevenue, setExpectedStockRevenue] = useState(0);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      // 1. Fetch Sales
      const sales = await database.get('sales_transactions').query().fetch();
      
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      
      let monthSales = 0;
      let totalSales = 0;
      
      sales.forEach(s => {
        totalSales += s.totalAmount;
        if (s.createdAt >= startOfMonth) monthSales += s.totalAmount;
      });

      // 2. Fetch Khata (Udhaar vs Payments)
      const ledger = await database.get('ledger_entries').query().fetch();
      let credit = 0;
      let payment = 0;
      
      ledger.forEach(e => {
        if (e.entryType === 'CREDIT') credit += e.amount;
        if (e.entryType === 'PAYMENT') payment += e.amount;
      });

      // 3. Fetch Inventory (Cost vs Expected Revenue)
      const inventory = await database.get('inventory_items').query().fetch();
      let invested = 0;
      let expected = 0;

      inventory.forEach(i => {
        invested += (i.purchasePrice * i.quantity);
        expected += (i.sellingPrice * i.quantity);
      });

      setThisMonthSales(monthSales);
      setAllTimeSales(totalSales);
      setTotalUdhaar(credit);
      setTotalPayments(payment);
      setStockInvestment(invested);
      setExpectedStockRevenue(expected);

    } catch (error) {
      console.error("Analytics Error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0C9C4C" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.header}>Business Analytics</Text>
          <Text style={styles.headerHinglish}>Mera Vyapar</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Done</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* REVENUE SECTION */}
        <Text style={styles.sectionTitle}>Sales & Revenue 💰</Text>
        <View style={styles.rowGrid}>
          <View style={[styles.card, styles.halfCard]}>
            <Text style={styles.cardLabel}>This Month's Sales</Text>
            <Text style={[styles.cardValue, { color: '#0C9C4C' }]}>₹{thisMonthSales.toLocaleString('en-IN')}</Text>
          </View>
          <View style={[styles.card, styles.halfCard]}>
            <Text style={styles.cardLabel}>All-Time Sales</Text>
            <Text style={styles.cardValue}>₹{allTimeSales.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {/* KHATA / CREDIT SECTION */}
        <Text style={styles.sectionTitle}>Khata Summary 📒</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.cardLabel}>Total Udhaar Given</Text>
              <Text style={[styles.cardValue, { color: '#E0433B' }]}>₹{totalUdhaar.toLocaleString('en-IN')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.cardLabel}>Total Payments Received</Text>
              <Text style={[styles.cardValue, { color: '#0C9C4C' }]}>₹{totalPayments.toLocaleString('en-IN')}</Text>
            </View>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.rowBetween}>
            <Text style={styles.cardLabel}>Net Market Pending (Baki)</Text>
            <Text style={[styles.cardValue, { fontSize: 20 }]}>
              ₹{Math.max(totalUdhaar - totalPayments, 0).toLocaleString('en-IN')}
            </Text>
          </View>
        </View>

        {/* INVENTORY / PROFIT SECTION */}
        <Text style={styles.sectionTitle}>Stock & Estimated Profit 📦</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.cardLabel}>Vendor Purchases (Cost)</Text>
              <Text style={styles.cardValue}>₹{stockInvestment.toLocaleString('en-IN')}</Text>
              <Text style={styles.cardSub}>Money tied in stock</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.cardLabel}>Expected Revenue (Sell)</Text>
              <Text style={[styles.cardValue, { color: '#0C9C4C' }]}>₹{expectedStockRevenue.toLocaleString('en-IN')}</Text>
              <Text style={styles.cardSub}>When all stock is sold</Text>
            </View>
          </View>

          <View style={styles.divider} />
          
          <View style={styles.rowBetween}>
            <Text style={styles.cardLabel}>Est. Profit in current stock</Text>
            <Text style={[styles.cardValue, { fontSize: 20, color: '#1D4ED8' }]}>
              ₹{Math.max(expectedStockRevenue - stockInvestment, 0).toLocaleString('en-IN')}
            </Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F6', padding: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F7F6' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 20 },
  header: { fontSize: 24, color: '#1B1F23', fontWeight: '800' },
  headerHinglish: { color: '#9CA3AF', fontSize: 13, fontStyle: 'italic', marginTop: 1 },
  closeBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#EAECEC' },
  closeBtnText: { color: '#1B1F23', fontWeight: '600' },

  sectionTitle: { color: '#6B7280', fontSize: 14, fontWeight: '700', marginTop: 10, marginBottom: 10, textTransform: 'uppercase' },
  
  card: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#EAECEC', marginBottom: 20 },
  rowGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  halfCard: { flex: 0.48, marginBottom: 0 },
  
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { color: '#6B7280', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  cardValue: { color: '#1B1F23', fontSize: 22, fontWeight: '800' },
  cardSub: { color: '#9CA3AF', fontSize: 11, marginTop: 4 },
  
  divider: { height: 1, backgroundColor: '#EAECEC', marginVertical: 15 },
});

export default AnalyticsScreen;