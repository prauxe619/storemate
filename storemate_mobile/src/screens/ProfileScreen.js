import React, { useState, useEffect, useContext } from 'react';
import { 
  SafeAreaView, View, Text, StyleSheet, TextInput, 
  TouchableOpacity, Alert, ActivityIndicator, Image,
  Share as RNShare, Modal, ScrollView, KeyboardAvoidingView, Platform 
} from 'react-native';
import AdminDashboard from './AdminDashboard'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs'; 
import { database } from '../core/database'; 
import { AuthContext } from '../../App';
import Share from 'react-native-share'; 
import { launchImageLibrary } from 'react-native-image-picker';
import AnalyticsScreen from './AnalyticsScreen';
import { SecureStorage } from '../utils/secureStorage';
import { backupNow } from '../services/BackupService';
import { BASE_URL } from '../config/api';

const ProfileScreen = () => {
  const { logout } = useContext(AuthContext);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false); 
  const [isBackingUp, setIsBackingUp] = useState(false); 
  const [isEditing, setIsEditing] = useState(false);

  const [email, setEmail] = useState('');
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState(''); 
  const [avatarUri, setAvatarUri] = useState(null); 
  const [upiId, setUpiId] = useState('');
  
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
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

  const handlePickAvatar = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.5 });
      if (result.didCancel || result.errorCode || !result.assets) return;

      const uri = result.assets[0].uri;
      setAvatarUri(uri);
      await AsyncStorage.setItem('avatarUri', uri);
    } catch (error) {
      Alert.alert("Error", "Could not pick an image.");
    }
  };

  const handleSave = async () => {
    if (!shopName.trim()) return Alert.alert("Validation", "Shop name cannot be empty.");
    
    setIsSaving(true);
    try {
      await AsyncStorage.setItem('shopName', shopName); 
      await AsyncStorage.setItem('userPhone', phone); 
      await AsyncStorage.setItem('userAddress', address); 
      await AsyncStorage.setItem('shopUpi', upiId); 

      const token = await AsyncStorage.getItem('userToken');
      await fetch(`${BASE_URL}/api/v1/auth/profile`, {
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
      setIsEditing(false);
      Alert.alert("Saved Locally", "Profile updated on this device. Will sync when online.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDriveBackup = async () => {
    setIsBackingUp(true);
    try {
      await backupNow();
      Alert.alert("Backup Successful ☁️", "Your Inventory, Sales, and Khata records are securely saved to your Google Drive.");
    } catch (error) {
      Alert.alert("Backup Error", error.message || "Failed to back up to Google Drive.");
    } finally {
      setIsBackingUp(false);
    }
  };

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

      const path = `${RNFS.CachesDirectoryPath}/Storemate_Ledger.csv`;
      await RNFS.writeFile(path, csvHeader + csvRows, 'utf8');

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
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.keyboardContainer}
      >
        {/* Fixed Header Row */}
        <View style={styles.headerRow}>
          <Text style={styles.header}>Profile & Settings</Text>
          <TouchableOpacity 
            style={styles.actionBtn} 
            onPress={() => isEditing ? handleSave() : setIsEditing(true)}
            disabled={isSaving}
            activeOpacity={0.85}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>{isEditing ? 'Save' : 'Edit'}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Scrollable Content Container optimized for all device sizes */}
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* SECTION 1: Store Information Card */}
          <View style={styles.card}>
            <View style={styles.avatarRow}>
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
              
              <View style={styles.avatarInfo}>
                <Text style={styles.avatarShopName} numberOfLines={1}>{shopName || 'Your Shop'}</Text>
                <Text style={styles.avatarEmail} numberOfLines={1}>{email || 'No email registered'}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.label}>Shop Name</Text>
            <TextInput 
              style={[styles.input, isEditing ? styles.inputEditable : styles.inputDisabled]} 
              value={shopName} 
              onChangeText={setShopName}
              editable={isEditing} 
              placeholder="Enter Shop Name"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.label}>Mobile Number</Text>
            <TextInput 
              style={[styles.input, isEditing ? styles.inputEditable : styles.inputDisabled]} 
              value={phone} 
              onChangeText={setPhone}
              editable={isEditing} 
              keyboardType="numeric"
              placeholder="e.g. 9876543210"
              placeholderTextColor="#9CA3AF"
              maxLength={10}
            />

            <Text style={styles.label}>Store Address</Text>
            <TextInput 
              style={[styles.input, isEditing ? styles.inputEditable : styles.inputDisabled, styles.textArea]} 
              value={address} 
              onChangeText={setAddress}
              editable={isEditing} 
              multiline={true}
              placeholder="Full shop address"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* SECTION 2: Payment Configuration */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Payment Integration</Text>
            <Text style={styles.label}>Shop UPI ID (For Khata Payments)</Text>
            <TextInput 
              style={[styles.input, isEditing ? styles.inputEditable : styles.inputDisabled]} 
              value={upiId} 
              onChangeText={setUpiId}
              editable={isEditing} 
              autoCapitalize="none"
              placeholder="e.g. 9876543210@paytm"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* SECTION 3: Business & Management Tools */}
          <View style={styles.toolsSection}>
            <Text style={styles.sectionTitle}>Business Tools</Text>

            {email === 'superadmin@gmail.com' && (
              <TouchableOpacity style={[styles.exportCard, styles.adminCard]} onPress={() => setShowAdmin(true)} activeOpacity={0.85}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.exportTitle, { color: '#B7791F' }]}>👑 Super Admin Dashboard</Text>
                  <Text style={styles.exportSubtitle}>Manage users and monitor system health.</Text>
                </View>
                <Text style={{ fontSize: 24 }}>🚀</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.exportCard} onPress={() => setShowAnalytics(true)} activeOpacity={0.85}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.exportTitle}>Business Analytics</Text>
                <Text style={styles.exportSubtitle}>View your profit, total sales, and market dues.</Text>
              </View>
              <Text style={{ fontSize: 24 }}>📈</Text>
            </TouchableOpacity>

            <View style={styles.exportCard}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.exportTitle}>Google Drive Cloud Backup</Text>
                <Text style={styles.exportSubtitle}>Save shop records to your private Google Drive space.</Text>
              </View>
              <TouchableOpacity style={styles.exportBtn} onPress={handleDriveBackup} disabled={isBackingUp} activeOpacity={0.85}>
                {isBackingUp ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.exportBtnText}>Backup</Text>}
              </TouchableOpacity>
            </View>

            <View style={styles.exportCard}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.exportTitle}>Export Khata for Accountant</Text>
                <Text style={styles.exportSubtitle}>Generate an Excel-ready (.csv) report of credits.</Text>
              </View>
              <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV} disabled={isExporting} activeOpacity={0.85}>
                {isExporting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.exportBtnText}>Export</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {/* SECTION 4: Logout Action */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
            <Text style={styles.logoutBtnText}>Logout of Storemate</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modals */}
      <Modal visible={showAdmin} animationType="slide" presentationStyle="pageSheet">
        <AdminDashboard onClose={() => setShowAdmin(false)} />
      </Modal>

      <Modal visible={showAnalytics} animationType="slide">
        <AnalyticsScreen onClose={() => setShowAnalytics(false)} />
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F5F7F6' 
  },
  keyboardContainer: { 
    flex: 1, 
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  loadingContainer: { 
    flex: 1, 
    backgroundColor: '#F5F7F6', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  headerRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 10,
    marginBottom: 6,
  },
  header: { 
    fontSize: 22, 
    color: '#1B1F23', 
    fontWeight: '800' 
  },
  actionBtn: { 
    backgroundColor: '#0C9C4C', 
    paddingVertical: 8, 
    paddingHorizontal: 18, 
    borderRadius: 10,
    minWidth: 75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 14 
  },
  
  scrollContent: { 
    paddingBottom: 40,
    flexGrow: 1,
  },

  card: { 
    backgroundColor: '#FFFFFF', 
    padding: 16, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: '#EAECEC', 
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  avatarRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 14 
  },
  avatarCircle: { 
    width: 60, 
    height: 60, 
    borderRadius: 30, 
    backgroundColor: '#0C9C4C', 
    alignItems: 'center', 
    justifyContent: 'center', 
    position: 'relative' 
  },
  avatarText: { 
    color: '#fff', 
    fontSize: 24, 
    fontWeight: '800' 
  },
  avatarImage: { 
    width: 60, 
    height: 60, 
    borderRadius: 30 
  },
  editBadge: { 
    position: 'absolute', 
    bottom: -2, 
    right: -2, 
    backgroundColor: '#FFFFFF', 
    borderRadius: 10, 
    width: 20, 
    height: 20, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: 1, 
    borderColor: '#EAECEC' 
  },
  avatarInfo: {
    marginLeft: 14, 
    flex: 1,
  },
  avatarShopName: { 
    color: '#1B1F23', 
    fontSize: 18, 
    fontWeight: '800' 
  },
  avatarEmail: { 
    color: '#6B7280', 
    fontSize: 13, 
    marginTop: 2 
  },
  divider: { 
    height: 1, 
    backgroundColor: '#EAECEC', 
    marginBottom: 14 
  },

  label: { 
    color: '#6B7280', 
    fontSize: 12.5, 
    marginBottom: 6, 
    fontWeight: '600' 
  },
  input: { 
    paddingHorizontal: 14,
    paddingVertical: 12, 
    borderRadius: 10, 
    borderWidth: 1, 
    marginBottom: 14, 
    fontSize: 14.5 
  },
  inputEditable: { 
    backgroundColor: '#FFFFFF', 
    color: '#1B1F23', 
    borderColor: '#0C9C4C' 
  },
  inputDisabled: { 
    borderColor: '#EAECEC', 
    color: '#6B7280', 
    backgroundColor: '#F9FAFB' 
  },
  textArea: {
    height: 65,
    textAlignVertical: 'top',
  },

  toolsSection: {
    marginBottom: 6,
  },
  exportCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 16, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: '#EAECEC', 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  adminCard: { 
    borderColor: '#F3D9A8', 
    backgroundColor: '#FFF9EE' 
  },
  exportTitle: { 
    color: '#1B1F23', 
    fontSize: 14.5, 
    fontWeight: '700', 
    marginBottom: 3 
  },
  exportSubtitle: { 
    color: '#6B7280', 
    fontSize: 11.5, 
    lineHeight: 15 
  },
  exportBtn: { 
    backgroundColor: '#0C9C4C', 
    paddingVertical: 9, 
    paddingHorizontal: 14, 
    borderRadius: 8, 
    justifyContent: 'center', 
    alignItems: 'center',
    minWidth: 70,
  },
  exportBtnText: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 13 
  },

  logoutBtn: { 
    backgroundColor: '#FDECEA', 
    marginTop: 6, 
    marginBottom: 20,
    padding: 15, 
    borderRadius: 12, 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#F7C9C4' 
  },
  logoutBtnText: { 
    color: '#E0433B', 
    fontSize: 15, 
    fontWeight: '700' 
  }
});

export default ProfileScreen;