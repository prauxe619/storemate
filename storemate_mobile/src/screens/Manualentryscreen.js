import React, { useState, useEffect, useMemo } from 'react';
import {
  SafeAreaView, View, Text, StyleSheet, TextInput, FlatList,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { database } from '../core/database';
import { Q } from '@nozbe/watermelondb';

const PRESET_AMOUNTS = [50, 100, 200, 500, 1000];

// Same shared entry point as the voice flow: builds a distinct, balance-aware
// customer list from ledger_entries so both paths see the same data.
async function loadCustomers() {
  const entries = await database.get('ledger_entries').query().fetch();
  const byName = {};

  entries.forEach(e => {
    const key = e.customerId.toLowerCase();
    if (!byName[key]) {
      byName[key] = { name: e.customerId, phone: e.customerPhone || '', balance: 0 };
    }
    if (e.entryType === 'CREDIT') byName[key].balance += e.amount;
    if (e.entryType === 'PAYMENT') byName[key].balance -= e.amount;
    if (e.customerPhone) byName[key].phone = e.customerPhone;
  });

  return Object.values(byName).sort((a, b) => a.name.localeCompare(b.name));
}

// This is what the screen produces on save - the same shape parseVoiceCommand
// returns, so both flows can share one save handler upstream if you want.
function buildEntry({ customer, isNewCustomer, amount, type, phone }) {
  return {
    customerName: customer,
    matchedCustomer: isNewCustomer ? null : { name: customer },
    amount,
    type,
    customerPhone: phone || '',
  };
}

const ManualEntryScreen = ({ onClose, onSaved, initialQuery = '' }) => {
  const [allCustomers, setAllCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCustomer, setSelectedCustomer] = useState(null); // { name, phone, balance } | null
  const [newPhone, setNewPhone] = useState('');

  const [amount, setAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const [entryType, setEntryType] = useState(null); // 'CREDIT' | 'PAYMENT'
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadCustomers().then(setAllCustomers);
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return allCustomers.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return allCustomers.filter(c => c.name.toLowerCase().includes(q));
  }, [searchQuery, allCustomers]);

  const exactMatchExists = allCustomers.some(
    c => c.name.toLowerCase() === searchQuery.trim().toLowerCase()
  );

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setSearchQuery(customer.name);
  };

  const handleUseNewName = () => {
    setSelectedCustomer({ name: searchQuery.trim(), phone: '', balance: 0, isNew: true });
  };

  const handlePresetTap = (value) => {
    setAmount(value);
    setShowCustomInput(false);
    setCustomAmount('');
  };

  const handleCustomConfirm = () => {
    const value = parseFloat(customAmount);
    if (!value || value <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than 0.');
      return;
    }
    setAmount(value);
    setShowCustomInput(false);
  };

  const canSave = selectedCustomer && amount && entryType && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);

    const entry = buildEntry({
      customer: selectedCustomer.name,
      isNewCustomer: !!selectedCustomer.isNew,
      amount,
      type: entryType,
      phone: selectedCustomer.isNew ? newPhone : selectedCustomer.phone,
    });

    try {
      await database.write(async () => {
        await database.get('ledger_entries').create(e => {
          e.customerId = entry.customerName;
          e.amount = entry.amount;
          e.entryType = entry.type;
          e.customerPhone = entry.customerPhone;
          e.isSynced = false;
          e.createdAt = Date.now();
        });
      });
      onSaved && onSaved(entry);
      onClose && onClose();
    } catch (error) {
      Alert.alert('Could not save', error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.header}>Add entry</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Step 1: Customer */}
        <Text style={styles.label}>Customer</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search or type a name"
          placeholderTextColor="#8b949e"
          value={searchQuery}
          onChangeText={(text) => { setSearchQuery(text); setSelectedCustomer(null); }}
        />

        {!selectedCustomer && (
          <FlatList
            style={styles.customerList}
            data={filteredCustomers}
            keyExtractor={(item) => item.name}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={true} 
            initialNumToRender={15}      
            maxToRenderPerBatch={10}     
            windowSize={5}
            ListFooterComponent={
              searchQuery.trim() && !exactMatchExists ? (
                <TouchableOpacity style={styles.newCustomerRow} onPress={handleUseNewName}>
                  <Text style={styles.newCustomerText}>+ Add new customer "{searchQuery.trim()}"</Text>
                </TouchableOpacity>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.customerRow} onPress={() => handleSelectCustomer(item)}>
                <Text style={styles.customerName}>{item.name}</Text>
                <Text style={[styles.customerBalance, item.balance > 0 && styles.owesText]}>
                  {item.balance > 0 ? `Owes ₹${item.balance.toFixed(0)}` : item.balance < 0 ? `Advance ₹${Math.abs(item.balance).toFixed(0)}` : 'Settled'}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}

        {selectedCustomer?.isNew && (
          <TextInput
            style={styles.searchInput}
            placeholder="WhatsApp number (optional)"
            placeholderTextColor="#8b949e"
            keyboardType="numeric"
            maxLength={10}
            value={newPhone}
            onChangeText={setNewPhone}
          />
        )}

        {selectedCustomer && (
          <>
            {/* Step 2: Amount */}
            <Text style={styles.label}>Amount</Text>
            <View style={styles.presetRow}>
              {PRESET_AMOUNTS.map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.presetBtn, amount === value && styles.presetBtnActive]}
                  onPress={() => handlePresetTap(value)}
                >
                  <Text style={[styles.presetBtnText, amount === value && styles.presetBtnTextActive]}>
                    ₹{value}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.presetBtn, showCustomInput && styles.presetBtnActive]}
                onPress={() => setShowCustomInput(true)}
              >
                <Text style={[styles.presetBtnText, showCustomInput && styles.presetBtnTextActive]}>Custom</Text>
              </TouchableOpacity>
            </View>

            {showCustomInput && (
              <View style={styles.customRow}>
                <TextInput
                  style={[styles.searchInput, { flex: 1 }]}
                  placeholder="Enter amount"
                  placeholderTextColor="#8b949e"
                  keyboardType="numeric"
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  autoFocus
                />
                <TouchableOpacity style={styles.customConfirmBtn} onPress={handleCustomConfirm}>
                  <Text style={styles.customConfirmText}>Set</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 3: Type */}
            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, entryType === 'CREDIT' && styles.typeBtnCredit]}
                onPress={() => setEntryType('CREDIT')}
              >
                <Text style={[styles.typeBtnText, entryType === 'CREDIT' && styles.typeBtnTextActive]}>
                  Udhaar (gave credit)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, entryType === 'PAYMENT' && styles.typeBtnPayment]}
                onPress={() => setEntryType('PAYMENT')}
              >
                <Text style={[styles.typeBtnText, entryType === 'PAYMENT' && styles.typeBtnTextActive]}>
                  Payment (received)
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Summary + save */}
        <View style={styles.footer}>
          {canSave && (
            <Text style={styles.summaryText}>
              ₹{amount} {entryType === 'CREDIT' ? 'udhaar for' : 'received from'} {selectedCustomer.name}
            </Text>
          )}
          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Text style={styles.saveBtnText}>{isSaving ? 'Saving...' : 'Save entry'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117', padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  header: { fontSize: 24, color: '#e6edf3', fontWeight: 'bold' },
  closeBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#21262d', borderRadius: 8 },
  closeBtnText: { color: '#c9d1d9', fontWeight: '600' },

  label: { color: '#8b949e', fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  searchInput: {
    backgroundColor: '#010409', color: '#c9d1d9', padding: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#30363d', fontSize: 16,
  },

  customerList: { maxHeight: 220, marginTop: 8 },
  customerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#21262d',
  },
  customerName: { color: '#e6edf3', fontSize: 16, fontWeight: '600' },
  customerBalance: { color: '#3fb950', fontSize: 13 },
  owesText: { color: '#da3633' },
  newCustomerRow: { paddingVertical: 14, paddingHorizontal: 4 },
  newCustomerText: { color: '#58a6ff', fontSize: 15, fontWeight: '600' },

  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  presetBtn: {
    paddingVertical: 12, paddingHorizontal: 18, backgroundColor: '#161b22',
    borderRadius: 10, borderWidth: 1, borderColor: '#30363d',
  },
  presetBtnActive: { backgroundColor: '#1f6feb', borderColor: '#1f6feb' },
  presetBtnText: { color: '#c9d1d9', fontWeight: '600', fontSize: 15 },
  presetBtnTextActive: { color: '#fff' },

  customRow: { flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'center' },
  customConfirmBtn: { backgroundColor: '#238636', paddingVertical: 14, paddingHorizontal: 18, borderRadius: 10 },
  customConfirmText: { color: '#fff', fontWeight: 'bold' },

  typeRow: { gap: 10 },
  typeBtn: {
    paddingVertical: 16, borderRadius: 10, borderWidth: 1, borderColor: '#30363d',
    backgroundColor: '#161b22', alignItems: 'center',
  },
  typeBtnCredit: { backgroundColor: '#da3633', borderColor: '#da3633' },
  typeBtnPayment: { backgroundColor: '#238636', borderColor: '#238636' },
  typeBtnText: { color: '#c9d1d9', fontWeight: '600', fontSize: 15 },
  typeBtnTextActive: { color: '#fff' },

  footer: { marginTop: 'auto', paddingTop: 16 },
  summaryText: { color: '#e6edf3', fontSize: 15, textAlign: 'center', marginBottom: 12, fontWeight: '600' },
  saveBtn: { backgroundColor: '#1f6feb', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#30363d' },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});

export default ManualEntryScreen;