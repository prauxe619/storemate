import React, { useState, useEffect } from 'react';
import { SafeAreaView, View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, Linking } from 'react-native';
import { database } from '../core/database';
import { Q } from '@nozbe/watermelondb'; // ✅ Added to prevent crashes in the phone search!
import AsyncStorage from '@react-native-async-storage/async-storage';

const KhataScreen = ({ onClose }) => {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null); // For Payment
  const [paymentAmount, setPaymentAmount] = useState('');

  // ✅ Phone Number Popup States
  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [activeRemindCustomer, setActiveRemindCustomer] = useState(null);
  const [newPhoneInput, setNewPhoneInput] = useState('');

  // ✅ History Modal States
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [activeCustomerHistory, setActiveCustomerHistory] = useState(null);

  const [shopConfig, setShopConfig] = useState({ name: 'Our Store', upiId: '' });

  const fetchKhata = async () => {
    try {
      const entries = await database.get('ledger_entries').query().fetch();
      
      const customerData = {};
      entries.forEach(entry => {
        const originalName = entry.customerId;
        
        // ✅ The Fix: Create a hidden, lowercase key to group the data perfectly
        const normalizedKey = originalName.trim().toLowerCase();
        
        // Initialize the customer object using the normalized key
        if (!customerData[normalizedKey]) {
          customerData[normalizedKey] = { 
            name: originalName, // Keeps the first typed version for display (e.g., "Rahul")
            balance: 0, 
            phone: null, 
            entryId: entry.id, 
            history: [] 
          };
        }
        
        if (entry.entryType === 'CREDIT') customerData[normalizedKey].balance += entry.amount;
        if (entry.entryType === 'PAYMENT') customerData[normalizedKey].balance -= entry.amount;
        
        if (entry.customerPhone) {
          customerData[normalizedKey].phone = entry.customerPhone;
        }

        // Save every transaction to their history log
        customerData[normalizedKey].history.push({
          id: entry.id,
          amount: entry.amount,
          type: entry.entryType,
          date: entry.createdAt || Date.now() 
        });
      });

      // Sort each customer's history so the newest transactions are at the top
      Object.values(customerData).forEach(c => {
        c.history.sort((a, b) => b.date - a.date);
      });

      const activeDebtors = Object.values(customerData).filter(c => c.balance !== 0);
      setCustomers(activeDebtors);
    } catch (error) {
      console.error("Error fetching Khata:", error);
    }
  };

  useEffect(() => {
  fetchKhata();
  loadShopConfig(); // 🚀 NEW: Load the shop details
}, []);

  const loadShopConfig = async () => {
    const name = await AsyncStorage.getItem('shopName');
    const upi = await AsyncStorage.getItem('shopUpi');
    setShopConfig({
      name: name || 'Kirana Store',
      upiId: upi || ''
    });
  };

  const sendWhatsAppReminder = (customerName, balance, phone) => {
  let message = `Namaste ${customerName} 🙏\n\nThis is a gentle reminder that your pending Khata (Udhaar) balance at our store is *₹${balance}*.\n\n`;

  // 🚀 Dynamically inject UPI only if the shop owner has set it in their profile
  if (shopConfig.upiId) {
    const upiLink = `upi://pay?pa=${shopConfig.upiId}&pn=${encodeURIComponent(shopConfig.name)}&am=${balance}&cu=INR`;
    message += `*Pay instantly via UPI:* 👇\n${upiLink}\n\nOr manually pay to UPI ID: ${shopConfig.upiId}\n\n`;
  } else {
    message += `Please visit the store to clear your dues.\n\n`;
  }

  message += `Thank you from ${shopConfig.name}!`;

  let formattedPhone = phone.replace(/\D/g, '');
  if (formattedPhone.length === 10) formattedPhone = `91${formattedPhone}`;

  const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
  Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open WhatsApp."));
};

  const handleRemindTap = (customer) => {
    if (customer.phone) {
      sendWhatsAppReminder(customer.name, customer.balance, customer.phone);
    } else {
      setActiveRemindCustomer(customer);
      setNewPhoneInput('');
      setPhoneModalVisible(true);
    }
  };

  const savePhoneAndSend = async () => {
    if (newPhoneInput.length < 10) return Alert.alert("Invalid", "Please enter a valid 10-digit number.");

    try {
      const existing = await database.get('ledger_entries').query(Q.where('customer_phone', newPhoneInput)).fetch();
      const otherCustomer = existing.find(e => e.customerId.toLowerCase() !== activeRemindCustomer.name.toLowerCase());
      
      if (otherCustomer) {
        return Alert.alert("Number in Use", `This number already belongs to ${otherCustomer.customerId}.`);
      }

      const entryToUpdate = await database.get('ledger_entries').find(activeRemindCustomer.entryId);
      await database.write(async () => {
        await entryToUpdate.update(e => {
          e.customerPhone = newPhoneInput;
          e.isSynced = false; 
        });
      });

      setPhoneModalVisible(false);
      sendWhatsAppReminder(activeRemindCustomer.name, activeRemindCustomer.balance, newPhoneInput);
      fetchKhata(); 
    } catch (error) {
      Alert.alert("Error saving number", error.message);
    }
  };

  const handlePayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return Alert.alert('Invalid Amount', 'Enter a valid number.');

    try {
      await database.write(async () => {
        await database.get('ledger_entries').create(entry => {
          entry.customerId = selectedCustomer.name;
          entry.amount = amount;
          entry.entryType = 'PAYMENT';
          entry.isSynced = false;
          entry.createdAt = Date.now();
          entry.customerPhone = selectedCustomer.phone; 
        });
      });
      Alert.alert('✅ Payment Logged', `₹${amount} cleared for ${selectedCustomer.name}.`);
      setPaymentAmount('');
      setSelectedCustomer(null);
      fetchKhata();
    } catch (error) {
      Alert.alert('Database Error', error.message);
    }
  };

  // ✅ Open the history popup
  const openHistory = (customer) => {
    setActiveCustomerHistory(customer);
    setHistoryModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.header}>Pending Khata</Text>
          <Text style={styles.headerHinglish}>Baki Udhaar</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Back</Text>
        </TouchableOpacity>
      </View>

      {customers.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🎉</Text>
          <Text style={styles.emptyText}>All dues are cleared!</Text>
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={item => item.name}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {/* ✅ Left side is now tappable to open history */}
              <TouchableOpacity style={styles.cardInfo} onPress={() => openHistory(item)} activeOpacity={0.7}>
                <Text style={styles.customerName}>{item.name}</Text>
                <Text style={[styles.customerBalance, item.balance < 0 && { color: '#0C9C4C' }]}>
                  {item.balance < 0 
                    ? `Advance: ₹${Math.abs(item.balance).toFixed(2)}` 
                    : `Owes: ₹${item.balance.toFixed(2)}`}
                </Text>
                <Text style={styles.viewHistoryHint}>Tap to view history ›</Text>
              </TouchableOpacity>
              
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.remindBtn} onPress={() => handleRemindTap(item)} activeOpacity={0.8}>
                  <Text style={styles.remindBtnText}>🔔 Remind</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settleBtn} onPress={() => setSelectedCustomer(item)} activeOpacity={0.85}>
                  <Text style={styles.settleBtnText}>Receive ₹</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* 🟢 TRANSACTION HISTORY MODAL */}
      <Modal visible={historyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.historyModalContent}>
            <View style={styles.historyHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>{activeCustomerHistory?.name}'s Khata</Text>
                
                {/* 🚀 NEW: Customer Details Section */}
                <Text style={styles.customerPhoneText}>
                  📞 {activeCustomerHistory?.phone ? activeCustomerHistory.phone : 'No phone number added'}
                </Text>

                <Text style={[styles.historySubtitle, activeCustomerHistory?.balance < 0 && { color: '#0C9C4C' }]}>
                  {activeCustomerHistory?.balance < 0 
                    ? `Advance: ₹${Math.abs(activeCustomerHistory.balance).toFixed(2)}` 
                    : `Total Due: ₹${Number(activeCustomerHistory?.balance || 0).toFixed(2)}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setHistoryModalVisible(false)} style={styles.closeCircleBtn}>
                <Text style={styles.closeCircleBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={activeCustomerHistory?.history || []}
              keyExtractor={item => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.historyRow}>
                  <View>
                    <Text style={item.type === 'CREDIT' ? styles.historyTypeCredit : styles.historyTypePayment}>
                      {item.type === 'CREDIT' ? '🔴 Udhar (Credit)' : '🟢 Paid (Received)'}
                    </Text>
                    {/* Formats nicely as: 24 Sept 2026, 02:30 PM */}
                    <Text style={styles.historyDate}>
                      {new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={item.type === 'CREDIT' ? styles.historyAmountCredit : styles.historyAmountPayment}>
                    {item.type === 'CREDIT' ? '+' : '-'}₹{Number(item.amount).toFixed(2)}
                  </Text>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* PHONE POPUP MODAL */}
      <Modal visible={phoneModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Phone Number</Text>
            <Text style={styles.modalSubtitle}>
              We don't have a number for {activeRemindCustomer?.name}. Add it once to send automatic reminders.
            </Text>
            
            <TextInput
              style={styles.input}
              placeholder="10-digit Mobile Number"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              maxLength={10}
              value={newPhoneInput}
              onChangeText={setNewPhoneInput}
            />
            
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPhoneModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={savePhoneAndSend} activeOpacity={0.85}>
                <Text style={styles.confirmBtnText}>Save & Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PAYMENT MODAL */}
      <Modal visible={!!selectedCustomer} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Settle Account</Text>
            <Text style={styles.modalSubtitle}>
              {selectedCustomer?.balance < 0 
                ? `${selectedCustomer?.name} has ₹${Math.abs(selectedCustomer.balance).toFixed(2)} in advance` 
                : `${selectedCustomer?.name} owes ₹${Number(selectedCustomer?.balance || 0).toFixed(2)}`}
            </Text>
            
            <TextInput
              style={styles.input}
              placeholder="Amount Received (₹)"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
            />
            
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setSelectedCustomer(null); setPaymentAmount(''); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handlePayment} activeOpacity={0.85}>
                <Text style={styles.confirmBtnText}>Confirm Payment</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ---- Palette (matches HomeScreen / App.js / InventoryScreen) ----
// Background #F5F7F6   Card #FFFFFF   Ink #1B1F23   Muted #6B7280
// Brand Green #0C9C4C  Alert Red #E0433B  Hairline #EAECEC
// Khata due amounts stay red (money owed to the shop), advances/payments go green.

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F6', padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  header: { fontSize: 24, color: '#1B1F23', fontWeight: '800' },
  headerHinglish: { color: '#9CA3AF', fontSize: 13, fontStyle: 'italic', marginTop: 1 },
  closeBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#EAECEC' },
  closeBtnText: { color: '#1B1F23', fontWeight: '600' },
  closeCircleBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F5F7F6', alignItems: 'center', justifyContent: 'center' },
  closeCircleBtnText: { color: '#1B1F23', fontWeight: '700' },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: '#1B1F23', fontSize: 17, fontWeight: '600' },
  
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 18, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#EAECEC' },
  cardInfo: { flex: 1, paddingRight: 10 },
  customerName: { color: '#1B1F23', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  customerBalance: { color: '#E0433B', fontSize: 15, fontWeight: '700' },
  viewHistoryHint: { color: '#0C9C4C', fontSize: 12, marginTop: 6, fontWeight: '600' },
  
  actionRow: { flexDirection: 'row' },
  remindBtn: { backgroundColor: '#F5F7F6', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#EAECEC', marginRight: 10 },
  remindBtnText: { color: '#1B1F23', fontWeight: '600', fontSize: 13 },
  settleBtn: { backgroundColor: '#0C9C4C', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  settleBtnText: { color: '#fff', fontWeight: '700' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(27,31,35,0.55)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#FFFFFF', padding: 25, borderRadius: 16, width: '85%', borderWidth: 1, borderColor: '#EAECEC' },
  modalTitle: { color: '#1B1F23', fontSize: 20, fontWeight: '800', marginBottom: 5 },
  modalSubtitle: { color: '#6B7280', fontSize: 14, marginBottom: 20 },
  input: { backgroundColor: '#F5F7F6', color: '#1B1F23', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#EAECEC', marginBottom: 20, fontSize: 18 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  cancelBtn: { padding: 15, marginRight: 10 },
  cancelBtnText: { color: '#6B7280', fontSize: 15, fontWeight: '700' },
  confirmBtn: { backgroundColor: '#0C9C4C', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 10 },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // History modal
  historyModalContent: { backgroundColor: '#FFFFFF', padding: 25, borderRadius: 16, width: '90%', maxHeight: '80%', borderWidth: 1, borderColor: '#EAECEC' },
  historyHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: '#EAECEC', paddingBottom: 15, marginBottom: 15 },
  historySubtitle: { color: '#E0433B', fontSize: 15, fontWeight: '700' },
  customerPhoneText: { color: '#6B7280', fontSize: 13, fontWeight: '600', marginTop: 4 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F7F6' },
  historyTypeCredit: { color: '#E0433B', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  historyTypePayment: { color: '#0C9C4C', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  historyDate: { color: '#9CA3AF', fontSize: 12 },
  historyAmountCredit: { color: '#E0433B', fontSize: 17, fontWeight: '800' },
  historyAmountPayment: { color: '#0C9C4C', fontSize: 17, fontWeight: '800' },
});

export default KhataScreen;