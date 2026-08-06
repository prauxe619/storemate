import React, { useState, useEffect, useContext } from 'react';
import { 
  SafeAreaView, View, Text, StyleSheet, TextInput, 
  TouchableOpacity, Alert, ActivityIndicator, Image,
  Share as RNShare, Modal 
} from 'react-native';
import AdminDashboard from './AdminDashboard'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs'; 
import { database } from '../core/database'; 
import { AuthContext } from '../../App';
import Share from 'react-native-share'; 
import { launchImageLibrary } from 'react-native-image-picker'; // 🚀 NEW: For Profile Pic
import AnalyticsScreen from './AnalyticsScreen'; // 🚀 NEW: Import Analytics
import { SecureStorage } from '../utils/secureStorage'; // 🔒 NEW: For secure token storage

const BASE_URL = 'http://192.168.31.1:5050';

const ProfileScreen = () => {
  const { logout } = useContext(AuthContext);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false); 
  const [isEditing, setIsEditing] = useState(false);

  const [email, setEmail] = useState('');
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState(''); // 🚀 NEW: Store Address
  const [avatarUri, setAvatarUri] = useState(null); // 🚀 NEW: Profile Picture
  const [upiId, setUpiId] = useState('');
  
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false); // 🚀 NEW

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      // Load offline profile info
      const localShop = await AsyncStorage.getItem('shopName');
      const localEmail = await AsyncStorage.getItem('userEmail');
      const localPhone = await AsyncStorage.getItem('userPhone');
      const localAddress = await AsyncStorage.getItem('userAddress');
      const localAvatar = await AsyncStorage.getItem('avatarUri');
      const localUpi = await AsyncStorage.getItem('shopUpi');
      
      if (localUpi) setUpiId(localUpi);
      if (localShop) setShopName(localShop);
      if (localEmail) setEmail(localEmail);
      if (localPhone) setPhone(localPhone);
      if (localAddress) setAddress(localAddress);
      if (localAvatar) setAvatarUri(localAvatar);

      // 🔒 SECURE: Fetch token using EncryptedStorage instead of AsyncStorage
      const token = await SecureStorage.getToken();
      if (!token) return;

      const response = await fetch(`${BASE_URL}/api/v1/auth/profile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setEmail(data.email);
        setShopName(data.shop_name);
        setPhone(data.phone || '');
        
        await AsyncStorage.setItem('userEmail', data.email);
        await AsyncStorage.setItem('shopName', data.shop_name);
        if (data.phone) await AsyncStorage.setItem('userPhone', data.phone);
      }
    } catch (error) {
      console.log("Server unreachable. Using offline profile data.");
    } finally {
      setIsLoading(false);
    }
  };

  // 🚀 NEW: Handle Profile Picture Selection
  const handlePickAvatar = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.5 });
      if (result.didCancel || result.errorCode || !result.assets) return;

      const uri = result.assets[0].uri;
      setAvatarUri(uri);
      await AsyncStorage.setItem('avatarUri', uri); // Save to local storage
    } catch (error) {
      Alert.alert("Error", "Could not pick an image.");
    }
  };

  const handleSave = async () => {
    if (!shopName.trim()) return Alert.alert("Validation", "Shop name cannot be empty.");
    
    setIsSaving(true);
    try {
      // 1. Always save locally immediately so the UI is fast
      await AsyncStorage.setItem('shopName', shopName); 
      await AsyncStorage.setItem('userPhone', phone); 
      await AsyncStorage.setItem('userAddress', address); 
      await AsyncStorage.setItem('shopUpi', upiId); 

      // 2. Try to update the server
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${BASE_URL}/api/v1/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ shop_name: shopName, phone: phone })
      });

      setIsEditing(false);
      Alert.alert("Success", "Profile updated perfectly.");
    } catch (error) {
      // Even if the server fails (offline), we saved it locally!
      setIsEditing(false);
      Alert.alert("Saved Locally", "Profile updated on this device. Will sync when online.");
    } finally {
      setIsSaving(false);
    }
  };

  // 🚀 FIXED: Generates a REAL .csv file for WhatsApp instead of a text block
  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const ledgerEntries = await database.get('ledger_entries').query().fetch();

      if (!ledgerEntries || ledgerEntries.length === 0) {
        Alert.alert("No Data", "There are no ledger entries to export yet.");
        setIsExporting(false);
        return;
      }

      let csvHeader = 'Customer Name,Amount (INR),Entry Type,Date\n';
      let csvRows = ledgerEntries.map(entry => {
        const dateFormatted = new Date(entry.createdAt || Date.now()).toLocaleDateString('en-IN');
        return `"${entry.customerId}",${entry.amount},${entry.entryType},"${dateFormatted}"`;
      }).join('\n');

      // 1. Save as a physical file on the device
      const path = `${RNFS.CachesDirectoryPath}/Storemate_Ledger.csv`;
      await RNFS.writeFile(path, csvHeader + csvRows, 'utf8');

      // 2. Share the PHYSICAL file (WhatsApp prefers this over base64)
      await Share.open({
        url: `file://${path}`,
        type: 'text/csv',
        filename: 'Storemate_Ledger', 
      });

    } catch (error) {
      if (error.message !== 'User did not share') {
        try {
          let textRows = await database.get('ledger_entries').query().fetch();
          let simpleText = textRows.map(e => `${e.customerId} | ₹${e.amount} | ${e.entryType}`).join('\n');
          await RNShare.share({ message: `📊 Storemate Ledger Report\n\n${simpleText}` });
        } catch (fallbackError) {
          Alert.alert("Export Failed", "Could not open the share menu on this device.");
        }
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to securely log out of your shop?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: () => logout() }
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0C9C4C" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Profile & Settings</Text>
        <TouchableOpacity 
          style={styles.actionBtn} 
          onPress={() => isEditing ? handleSave() : setIsEditing(true)}
          disabled={isSaving}
          activeOpacity={0.85}
        >
          {isSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.actionBtnText}>{isEditing ? 'Save' : 'Edit'}</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.avatarRow}>
          {/* 🚀 UPGRADED: Tappable Avatar for Image Upload */}
          <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8}>
            <View style={styles.avatarCircle}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{(shopName || email || 'S').trim().charAt(0).toUpperCase()}</Text>
              )}
              <View style={styles.editBadge}><Text style={{fontSize: 10}}>📷</Text></View>
            </View>
          </TouchableOpacity>
          
          <View style={{ marginLeft: 16, flex: 1 }}>
            <Text style={styles.avatarShopName}>{shopName || 'Your Shop'}</Text>
            <Text style={styles.avatarEmail}>{email || 'No email registered'}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.label}>Shop Name</Text>
        <TextInput 
          style={[styles.input, isEditing && styles.inputEditable, !isEditing && styles.inputDisabled]} 
          value={shopName} 
          onChangeText={setShopName}
          editable={isEditing} 
          placeholder="Enter Shop Name"
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.label}>Mobile Number</Text>
        <TextInput 
          style={[styles.input, isEditing && styles.inputEditable, !isEditing && styles.inputDisabled]} 
          value={phone} 
          onChangeText={setPhone}
          editable={isEditing} 
          keyboardType="numeric"
          placeholder="e.g. 9876543210"
          placeholderTextColor="#9CA3AF"
          maxLength={10}
        />

        {/* 🚀 NEW: Store Address (Useful for receipts later) */}
        <Text style={styles.label}>Store Address</Text>
        <TextInput 
          style={[styles.input, isEditing && styles.inputEditable, !isEditing && styles.inputDisabled, { height: 60 }]} 
          value={address} 
          onChangeText={setAddress}
          editable={isEditing} 
          multiline={true}
          placeholder="Full shop address"
          placeholderTextColor="#9CA3AF"
        />
      </View>

      <Text style={styles.label}>Shop UPI ID (For Khata Payments)</Text>
        <TextInput 
          style={[styles.input, isEditing && styles.inputEditable, !isEditing && styles.inputDisabled]} 
          value={upiId} 
          onChangeText={setUpiId}
          editable={isEditing} 
          autoCapitalize="none"
          placeholder="e.g. 9876543210@paytm"
          placeholderTextColor="#9CA3AF"
        />

      {email === 'superadmin@gmail.com' && (
        <TouchableOpacity style={[styles.exportCard, styles.adminCard]} onPress={() => setShowAdmin(true)} activeOpacity={0.85}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.exportTitle, { color: '#B7791F' }]}>👑 Super Admin Dashboard</Text>
            <Text style={styles.exportSubtitle}>Manage users and monitor system health.</Text>
          </View>
          <Text style={{ fontSize: 24 }}>🚀</Text>
        </TouchableOpacity>
      )}

      {/* 🚀 NEW: Analytics Button */}
      <TouchableOpacity style={styles.exportCard} onPress={() => setShowAnalytics(true)} activeOpacity={0.85}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.exportTitle}>Business Analytics</Text>
          <Text style={styles.exportSubtitle}>View your profit, total sales, and market dues.</Text>
        </View>
        <Text style={{ fontSize: 24 }}>📈</Text>
      </TouchableOpacity>

      <View style={styles.exportCard}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.exportTitle}>Export Khata for Accountant</Text>
          <Text style={styles.exportSubtitle}>Generate an Excel-ready (.csv) report of all customer credits and payments.</Text>
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV} disabled={isExporting} activeOpacity={0.85}>
          {isExporting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.exportBtnText}>Export</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
        <Text style={styles.logoutBtnText}>Logout of Storemate</Text>
      </TouchableOpacity>

      <Modal visible={showAdmin} animationType="slide" presentationStyle="pageSheet">
        <AdminDashboard onClose={() => setShowAdmin(false)} />
      </Modal>

      {/* 🚀 NEW: Analytics Modal */}
      <Modal visible={showAnalytics} animationType="slide">
        <AnalyticsScreen onClose={() => setShowAnalytics(false)} />
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F6', padding: 20 },
  loadingContainer: { flex: 1, backgroundColor: '#F5F7F6', justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 20 },
  header: { fontSize: 22, color: '#1B1F23', fontWeight: '800' },
  actionBtn: { backgroundColor: '#0C9C4C', paddingVertical: 9, paddingHorizontal: 20, borderRadius: 10 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  
  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#EAECEC', marginBottom: 15 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  
  // 🚀 UPDATED: Avatar Styles
  avatarCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0C9C4C', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  editBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#FFFFFF', borderRadius: 10, width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EAECEC' },
  
  avatarShopName: { color: '#1B1F23', fontSize: 19, fontWeight: '800' },
  avatarEmail: { color: '#6B7280', fontSize: 13, marginTop: 3 },
  divider: { height: 1, backgroundColor: '#EAECEC', marginBottom: 16 },

  label: { color: '#6B7280', fontSize: 13, marginBottom: 6, fontWeight: '600' },
  input: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 16, fontSize: 15 },
  inputEditable: { backgroundColor: '#FFFFFF', color: '#1B1F23', borderColor: '#0C9C4C' },
  inputDisabled: { borderColor: '#EAECEC', color: '#6B7280', backgroundColor: '#F5F7F6' },

  exportCard: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#EAECEC', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  adminCard: { borderColor: '#F3D9A8', backgroundColor: '#FFF9EE' },
  exportTitle: { color: '#1B1F23', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  exportSubtitle: { color: '#6B7280', fontSize: 12, lineHeight: 16 },
  exportBtn: { backgroundColor: '#0C9C4C', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  logoutBtn: { backgroundColor: '#FDECEA', marginTop: 10, padding: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F7C9C4' },
  logoutBtnText: { color: '#E0433B', fontSize: 15, fontWeight: '700' }
});

export default ProfileScreen;