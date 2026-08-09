import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal, PermissionsAndroid, ScrollView, Animated, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { database } from '../core/database';
import { syncWithCloud } from '../core/sync/sync';
import POSScreen from '../screens/POSScreen';
import NetInfo from '@react-native-community/netinfo'; 
import KhataScreen from '../screens/KhataScreen';
import LowStockWidget from '../components/LowStockWidget';
import ManualEntryScreen from '../screens/Manualentryscreen';
import AsyncStorage from '@react-native-async-storage/async-storage'; 
import { executeAIAction } from '../core/ai/IntentHandler'; 
import { SpeechEngine } from '../core/speech/SpeechEngine';

// 🚀 Make sure to change this to your actual server IP or URL
const BASE_URL = 'http://192.168.31.65:5050'; 

const HomeScreen = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [showPOS, setShowPOS] = useState(false);
  const [showKhata, setShowKhata] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualEntryPrefill, setManualEntryPrefill] = useState('');
  const [todaySales, setTodaySales] = useState(0);
  const [pendingKhata, setPendingKhata] = useState(0);
  const [isOffline, setIsOffline] = useState(false); 
  const [isListening, setIsListening] = useState(false);
  const [aiStatus, setAiStatus] = useState("Tap the mic to speak a command");
  const [transcribedText, setTranscribedText] = useState("");
  const [shopName, setShopName] = useState("Your Store");
  const [avatarUri, setAvatarUri] = useState(null); 

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const isProcessingCommand = useRef(false); // 🚀 Guard lock for duplicate voice events

  useEffect(() => {
    let loop;
    if (isListening) {
      pulseAnim.setValue(0);
      loop = Animated.loop(
        Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: true })
      );
      loop.start();
    } else {
      pulseAnim.setValue(0);
    }
    return () => loop && loop.stop();
  }, [isListening]);

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  const fetchMetrics = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sales = await database.get('sales_transactions')
        .query(Q.where('created_at', Q.gte(today.getTime())))
        .fetch();
      setTodaySales(sales.reduce((sum, s) => sum + s.totalAmount, 0));

      const entries = await database.get('ledger_entries').query().fetch();
      let totalKhata = 0;
      entries.forEach(e => {
        if (e.entryType === 'CREDIT') totalKhata += e.amount;
        if (e.entryType === 'PAYMENT') totalKhata -= e.amount;
      });
      setPendingKhata(Math.max(totalKhata, 0));
    } catch (error) {
      console.error("Metrics error:", error);
    }
  };

  const autoSyncBackground = async () => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      await syncWithCloud();
      setIsSyncing(false);
    } catch (e) {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    
    const loadProfileData = async () => {
      try {
        const storedName = await AsyncStorage.getItem('shopName');
        const storedAvatar = await AsyncStorage.getItem('avatarUri'); 
        
        if (storedName) setShopName(storedName);
        if (storedAvatar) setAvatarUri(storedAvatar); 
      } catch (error) {
        console.error("Failed to load profile data:", error);
      }
    };
    loadProfileData(); 
    
    const unsubscribeNetInfo = NetInfo.addEventListener(state => {
      const currentlyOffline = !(state.isConnected && state.isInternetReachable !== false);
      
      setIsOffline(prevOffline => {
        if (prevOffline === true && currentlyOffline === false) {
          console.log("🌐 Network returned! Auto-syncing...");
          autoSyncBackground();
        }
        return currentlyOffline;
      });
    });

    // 🚀 UPDATED: Custom Speech Listeners with Lock Guard
    const partialSub = SpeechEngine.onPartialResult((text) => {
      setTranscribedText(text);
      setAiStatus("Listening…");
    });

    const finalSub = SpeechEngine.onFinalResult(async (text) => {
      // Prevent duplicate POST requests
      if (isProcessingCommand.current) return;
      isProcessingCommand.current = true;

      setTranscribedText(text);
      setIsListening(false);

      try {
        await processVoiceCommand(text);
      } finally {
        isProcessingCommand.current = false;
      }
    });

    const errorSub = SpeechEngine.onError((code) => {
      setIsListening(false);
      isProcessingCommand.current = false;
      
      let errorMsg = `Error Code: ${code}`;
      if (code === 6) errorMsg = "Speech timeout (didn't hear anything)";
      if (code === 7) errorMsg = "No match (speak louder/clearer)";
      if (code === 8) errorMsg = "Google Speech server busy";
      if (code === 9) errorMsg = "Insufficient permissions";

      setAiStatus(`Mic failed: ${errorMsg}`);
      console.log("Android Speech Error Code:", code);
    });

    return () => { 
      unsubscribeNetInfo();
      partialSub.remove();
      finalSub.remove();
      errorSub.remove();
    };
  }, []);

  const processVoiceCommand = async (text) => {
    setAiStatus("Thinking...");

    try {
      // 🚀 Fetch inventory items to pass to local RapidFuzz parser
      const inventoryItems = await database.get('inventory_items').query().fetch();
      const inventoryNames = inventoryItems.map(i => i.productName);

      const response = await fetch(`${BASE_URL}/api/v1/ai/parse-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: text,
          inventory_names: inventoryNames 
        })
      });

      if (!response.ok) throw new Error("API Network Error");
      
      const aiData = await response.json();

      setAiStatus("Updating database...");
      const resultMessage = await executeAIAction(aiData);

      setAiStatus(resultMessage);
      fetchMetrics(); 

    } catch (error) {
      console.error("AI Pipeline Error:", error);
      setAiStatus("Connection failed. Try again.");
    }
  };

  const safeMicPress = async () => {
    try {
      if (isListening) {
        await SpeechEngine.stop();
        setIsListening(false);
        setAiStatus("Tap the mic to speak a command");
      } else {
        setTranscribedText("");
        setAiStatus("Initializing mic...");
        setIsListening(true);
        await SpeechEngine.start();
      }
    } catch (error) {
      setIsListening(false);
      console.log('Voice start failed:', error.message);
      handleVoiceUnavailable(error.message || "Microphone permission denied.");
    }
  };

  const handleVoiceUnavailable = (reason) => {
    setAiStatus("Voice unavailable — use manual entry below");
    Alert.alert(
      "Microphone Error",
      `${reason}\n\nPlease check Settings > Apps > StoreMate > Permissions > Microphone.`,
      [
        { text: "Use manual entry", onPress: () => setShowManualEntry(true) },
        { text: "OK", style: "cancel" },
      ]
    );
  };

  const handleManualSync = async () => {
    try {
      setIsSyncing(true);
      const result = await syncWithCloud();
      setIsSyncing(false);
      Alert.alert(result?.success ? "Synced" : "Sync paused", result?.message || (result?.success ? "Backed up successfully." : "Could not reach server."));
    } catch (error) {
      setIsSyncing(false);
      Alert.alert("Error", error.message);
    }
  };

  const handlePOSClose = () => { setShowPOS(false); fetchMetrics(); };

  const initial = (shopName || 'S').trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      {isOffline && (
        <View style={styles.offlineBanner}>
          <View style={styles.offlineDot} />
          <Text style={styles.offlineText}>Offline — saving to this device</Text>
        </View>
      )}

      <View style={styles.topBar}>
        <View style={styles.avatarCircle}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{initial}</Text>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.storeName} numberOfLines={1}>{shopName}</Text>
          <Text style={styles.syncStatus}>
            {isSyncing ? 'Syncing…' : isOffline ? 'Not backed up' : 'Backed up'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleManualSync} disabled={isSyncing} style={styles.syncIconBtn} activeOpacity={0.7}>
          {isSyncing ? <ActivityIndicator color="#0C9C4C" size="small" /> : <Text style={styles.syncIconText}>☁</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={{ paddingBottom: 140 }} 
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.balanceCard}>
          <View style={styles.balanceHalf}>
            <Text style={styles.balanceLabel}>TODAY'S SALES</Text>
            <Text style={[styles.balanceValue, { color: '#0C9C4C' }]}>₹{todaySales.toLocaleString('en-IN')}</Text>
            <Text style={styles.balanceSubLabel}>Aaj ki Bikri</Text>
          </View>
          <View style={styles.balanceDivider} />
          <TouchableOpacity style={styles.balanceHalf} onPress={() => setShowKhata(true)} activeOpacity={0.75}>
            <Text style={styles.balanceLabel}>YOU'LL GET</Text>
            <Text style={[styles.balanceValue, { color: pendingKhata > 0 ? '#E0433B' : '#0C9C4C' }]}>
              ₹{pendingKhata.toLocaleString('en-IN')}
            </Text>
            <Text style={styles.balanceSubLabel}>Baki Udhaar ›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionGrid}>
          <TouchableOpacity style={styles.actionTile} onPress={() => setShowPOS(true)} activeOpacity={0.8}>
            <View style={[styles.actionIconWrap, { backgroundColor: '#E7F7EE' }]}>
              <Text style={styles.actionIcon}>🛒</Text>
            </View>
            <Text style={styles.actionLabel}>New Sale</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionTile} onPress={() => setShowKhata(true)} activeOpacity={0.8}>
            <View style={[styles.actionIconWrap, { backgroundColor: '#FDECEA' }]}>
              <Text style={styles.actionIcon}>📒</Text>
            </View>
            <Text style={styles.actionLabel}>Khata</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionTile} onPress={() => { setManualEntryPrefill(''); setShowManualEntry(true); }} activeOpacity={0.8}>
            <View style={[styles.actionIconWrap, { backgroundColor: '#EAF2FE' }]}>
              <Text style={styles.actionIcon}>✍️</Text>
            </View>
            <Text style={styles.actionLabel}>Add Entry</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionTile} onPress={handleManualSync} disabled={isSyncing} activeOpacity={0.8}>
            <View style={[styles.actionIconWrap, { backgroundColor: '#FFF6E5' }]}>
              <Text style={styles.actionIcon}>☁️</Text>
            </View>
            <Text style={styles.actionLabel}>Backup</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.aiCard, isListening && styles.aiCardActive]}>
          <View style={styles.aiHeaderRow}>
            <View style={styles.micWrap}>
              {isListening && (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.pulseRing, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]}
                />
              )}
              <TouchableOpacity style={[styles.micButton, isListening && styles.micButtonActive]} onPress={safeMicPress} activeOpacity={0.85}>
                <Text style={styles.micIcon}>{isListening ? "⏹" : "🎙"}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.aiTitle}>Speak an entry</Text>
              <Text style={styles.aiSubtitle} numberOfLines={2}>{aiStatus}</Text>
            </View>
          </View>
          {!!transcribedText && <Text style={styles.speechPreview}>"{transcribedText}"</Text>}
          <TouchableOpacity onPress={() => { setManualEntryPrefill(''); setShowManualEntry(true); }} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
            <Text style={styles.typeInsteadLink}>Type instead</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
          <LowStockWidget />
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setShowPOS(true)} activeOpacity={0.85}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <Modal visible={showPOS} animationType="slide">
        <POSScreen onClose={handlePOSClose} />
      </Modal>
      <Modal visible={showKhata} animationType="slide">
        <KhataScreen onClose={() => { setShowKhata(false); fetchMetrics(); }} />
      </Modal>
      <Modal visible={showManualEntry} animationType="slide">
        <ManualEntryScreen
          initialQuery={manualEntryPrefill}
          onClose={() => setShowManualEntry(false)}
          onSaved={() => { setAiStatus("Entry saved"); fetchMetrics(); }}
        />
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F6' },
  offlineBanner: { backgroundColor: '#1B1F23', paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  offlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E0433B', marginRight: 8 },
  offlineText: { color: '#FFFFFF', fontWeight: '600', fontSize: 12.5, letterSpacing: 0.2 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EAECEC' },
  avatarCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#0C9C4C', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: 42, height: 42, borderRadius: 21 },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  storeName: { color: '#1B1F23', fontSize: 17, fontWeight: '800' },
  syncStatus: { color: '#6B7280', fontSize: 12, marginTop: 1 },
  syncIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7F6' },
  syncIconText: { fontSize: 17, color: '#0C9C4C' },
  balanceCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EAECEC', shadowColor: '#000000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1, overflow: 'hidden' },
  balanceHalf: { flex: 1, paddingVertical: 20, paddingHorizontal: 16 },
  balanceDivider: { width: 1, backgroundColor: '#EAECEC' },
  balanceLabel: { color: '#6B7280', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  balanceValue: { fontSize: 23, fontWeight: '800' },
  balanceSubLabel: { color: '#9CA3AF', fontSize: 12, marginTop: 4 },
  
  actionGrid: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingHorizontal: 12, 
    marginTop: 18, 
    marginBottom: 6,
    gap: 4, 
  },
  actionTile: { flex: 1, alignItems: 'center' },
  actionIconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  actionIcon: { fontSize: 22 },
  actionLabel: { color: '#1B1F23', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  
  aiCard: { backgroundColor: '#FFFFFF', marginHorizontal: 16, marginTop: 18, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EAECEC' },
  aiCardActive: { borderColor: '#0C9C4C' },
  aiHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  aiTitle: { color: '#1B1F23', fontSize: 15, fontWeight: '800' },
  aiSubtitle: { color: '#6B7280', fontSize: 12.5, marginTop: 2 },
  speechPreview: { color: '#1B1F23', fontSize: 13.5, fontStyle: 'italic', marginTop: 12, backgroundColor: '#F5F7F6', padding: 10, borderRadius: 10 },
  micWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 50, height: 50, borderRadius: 25, backgroundColor: '#E0433B' },
  micButton: { backgroundColor: '#0C9C4C', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  micButtonActive: { backgroundColor: '#E0433B' },
  micIcon: { fontSize: 21 },
  typeInsteadLink: { color: '#0C9C4C', fontSize: 13, fontWeight: '700' },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: '#0C9C4C', alignItems: 'center', justifyContent: 'center', shadowColor: '#0C9C4C', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  fabIcon: { color: '#FFFFFF', fontSize: 30, fontWeight: '400', marginTop: -2 },
});

export default HomeScreen;