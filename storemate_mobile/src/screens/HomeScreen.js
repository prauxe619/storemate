import React, { useState, useEffect, useRef } from 'react';
import { SafeAreaView, View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal, PermissionsAndroid, ScrollView, Animated, Image } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../core/database';
import { syncWithCloud } from '../core/sync/sync';
import POSScreen from '../screens/POSScreen';
import NetInfo from '@react-native-community/netinfo'; 
import KhataScreen from '../screens/KhataScreen';
import LowStockWidget from '../components/LowStockWidget';
import ManualEntryScreen from '../screens/Manualentryscreen';
import { parseVoiceCommand } from '../core/Voiceparser';
import AsyncStorage from '@react-native-async-storage/async-storage'; 

let Voice = null;
try { Voice = require('@react-native-voice/voice').default; } catch (e) { Voice = null; } 

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
  const [avatarUri, setAvatarUri] = useState(null); // 🚀 NEW: State for profile picture

  // Gentle pulse ring behind the mic while it's listening — the one
  // "alive" moment in an otherwise calm, paper-quiet screen.
  const pulseAnim = useRef(new Animated.Value(0)).current;

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
        const storedAvatar = await AsyncStorage.getItem('avatarUri'); // 🚀 NEW: Fetch Image
        
        if (storedName) setShopName(storedName);
        if (storedAvatar) setAvatarUri(storedAvatar); // 🚀 NEW: Set Image
      } catch (error) {
        console.error("Failed to load profile data:", error);
      }
    };
    loadProfileData(); // 🚀 UPGRADED: Replaced loadShopName()
    
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

    if (!Voice) return unsubscribeNetInfo;

    Voice.onSpeechStart = () => { setIsListening(true); setAiStatus("Listening…"); };
    Voice.onSpeechEnd = () => setIsListening(false);
    Voice.onSpeechResults = (e) => {
      if (e.value?.length) {
        setTranscribedText(e.value[0]);
        processVoiceCommand(e.value[0]);
      }
    };
    Voice.onSpeechError = () => {
      setIsListening(false);
      setAiStatus("Didn't catch that — try again");
    };

    return () => { 
      unsubscribeNetInfo();
      Voice?.destroy().then(Voice.removeAllListeners).catch(() => {}); 
    };
  }, []);

  const processVoiceCommand = async (text) => {
    setAiStatus("Processing…");

    // Same distinct-customer aggregation ManualEntryScreen uses, so both
    // paths fuzzy-match against the same list.
    const entries = await database.get('ledger_entries').query().fetch();
    const existingCustomers = [...new Set(entries.map(e => e.customerId))].map(name => ({ name }));

    const result = parseVoiceCommand(text, existingCustomers);

    // Anything uncertain (missing amount, ambiguous type, unclear name) goes
    // straight to manual entry pre-filled with whatever we did understand,
    // instead of guessing with someone's money.
    if (result.needsClarification) {
      setAiStatus(result.reason);
      setManualEntryPrefill(result.customerName || '');
      setShowManualEntry(true);
      return;
    }

    try {
      await database.write(async () => {
        await database.get('ledger_entries').create(entry => {
          entry.customerId = result.customerName;
          entry.amount = result.amount;
          entry.entryType = result.type;
          entry.isSynced = false;
          entry.createdAt = Date.now();
        });
      });
      setAiStatus(`Logged ₹${result.amount} for ${result.customerName}`);
      fetchMetrics();
    } catch (err) {
      setAiStatus("Couldn't save that, please try again");
    }
  };

  const safeMicPress = async () => {
    try {
      if (isListening) {
        await Voice.stop();
        setIsListening(false);
      } else {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert("Microphone Disabled", "Cannot use the AI Brain without audio permissions.");
          return;
        }

        setTranscribedText("");
        setAiStatus("Initializing hardware...");
        
        try {
          // 1. Check if the OS even acknowledges a speech engine exists
          const services = await Voice.getSpeechRecognitionServices();
          if (!services || services.length === 0) {
            handleVoiceUnavailable("Your phone has no speech recognition service installed.");
            return;
          }

          // 2. en-IN first (matches Hinglish speech), fall back to device default
          // if the locale itself isn't installed on this phone.
          try {
            await Voice.start('en-IN');
          } catch (localeErr) {
            console.log('en-IN failed, trying device default:', extractNativeError(localeErr));
            await Voice.start(); // no locale = use whatever the OS default is
          }
        } catch (startErr) {
          // This is the actual fix: pull .message/.code out instead of
          // JSON.stringify-ing an Error object, which always returns "{}".
          throw new Error(extractNativeError(startErr));
        }
      }
    } catch (e) {
      setIsListening(false);
      console.log('Voice start failed:', e.message);
      handleVoiceUnavailable(e.message);
    }
  };

  // Reads whatever shape the native module actually threw. @react-native-voice/voice
  // rejects with different shapes across Android versions/vendors - sometimes a real
  // Error, sometimes { error: { message, code } }, sometimes a bare string.
  const extractNativeError = (err) => {
    if (!err) return 'Unknown error';
    if (err.error?.message) return `${err.error.message} (code ${err.error.code ?? '?'})`;
    if (err.message) return err.message;
    if (typeof err === 'string') return err;
    try { return JSON.stringify(err); } catch { return 'Unrecognized error shape'; }
  };

  // Voice failing is common enough on real devices (MIUI/Xiaomi especially) that
  // it can't be a dead end - drop straight into manual entry instead of just an alert.
  const handleVoiceUnavailable = (reason) => {
    setAiStatus("Voice unavailable — use manual entry below");
    Alert.alert(
      "Voice isn't working on this phone",
      `${reason}\n\nOn Xiaomi/MIUI phones this is often a permission the app can't request itself - check Settings > Apps > StoreMate > Permissions > Microphone, and Settings > Apps > Default apps > Digital assistant app (should be Google, not Xiaomi Assistant).\n\nYou can keep using manual entry below in the meantime.`,
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

      {/* Top bar — avatar + shop name + sync status, like the app-bar on KhataBook/OkCredit */}
      <View style={styles.topBar}>
        <View style={styles.avatarCircle}>
          {/* 🚀 UPGRADED: Show Image if available, else show the Letter */}
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

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* Big two-tone balance card — the "You'll Get / You'll Give" pattern every
            khata app leads with, because it's the one number the owner actually needs. */}
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

        {/* Quick-action grid — mirrors the row of square icon buttons under the
            balance card on Vyapar / OkCredit (Add Sale, Add Customer, Reports…). */}
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

        {/* Voice assistant — kept as its own card since it's this app's point of
            difference from KhataBook/OkCredit, but restyled to the same flat/green language. */}
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

      {/* Floating action button — the single most recognizable element across
          KhataBook, OkCredit and Vyapar's home screens. */}
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

// ---- Palette ---------------------------------------------------------------
// Referenced against KhataBook / OkCredit / Vyapar home screens: flat white
// surfaces, one dominant green for "trust / money in", red reserved only for
// money owed, big bold numbers, minimal ornamentation, bottom FAB.
//
// Background  #F5F7F6  near-white, faint green-grey (not pure #FFF, not warm cream)
// Card        #FFFFFF  raised surfaces
// Brand Green #0C9C4C  primary — sales, positive balance, FAB, sync
// Alert Red   #E0433B  "you'll get" when > 0, offline, mic active
// Ink         #1B1F23  headings / primary text
// Muted       #6B7280  secondary text / labels
// Hairline    #EAECEC  dividers, borders
// -----------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F6' },

  offlineBanner: { backgroundColor: '#1B1F23', paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  offlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E0433B', marginRight: 8 },
  offlineText: { color: '#FFFFFF', fontWeight: '600', fontSize: 12.5, letterSpacing: 0.2 },

  // Top app-bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAECEC',
  },
  avatarCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#0C9C4C',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', // 🚀 NEW: Keeps the image perfectly round
  },
  avatarImage: {
    width: 42, height: 42, borderRadius: 21, // 🚀 NEW: Sizes the image to fit the circle
  },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  storeName: { color: '#1B1F23', fontSize: 17, fontWeight: '800' },
  syncStatus: { color: '#6B7280', fontSize: 12, marginTop: 1 },
  syncIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7F6' },
  syncIconText: { fontSize: 17, color: '#0C9C4C' },

  // Balance card — "You'll Get" pattern
  balanceCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAECEC',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    overflow: 'hidden',
  },
  balanceHalf: { flex: 1, paddingVertical: 20, paddingHorizontal: 16 },
  balanceDivider: { width: 1, backgroundColor: '#EAECEC' },
  balanceLabel: { color: '#6B7280', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  balanceValue: { fontSize: 23, fontWeight: '800' },
  balanceSubLabel: { color: '#9CA3AF', fontSize: 12, marginTop: 4 },

  // Quick action grid
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 6,
  },
  actionTile: { flex: 1, alignItems: 'center' },
  actionIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  actionIcon: { fontSize: 22 },
  actionLabel: { color: '#1B1F23', fontSize: 12, fontWeight: '600', textAlign: 'center' },

  // Voice assistant card
  aiCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAECEC',
  },
  aiCardActive: { borderColor: '#0C9C4C' },
  aiHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  aiTitle: { color: '#1B1F23', fontSize: 15, fontWeight: '800' },
  aiSubtitle: { color: '#6B7280', fontSize: 12.5, marginTop: 2 },
  speechPreview: { color: '#1B1F23', fontSize: 13.5, fontStyle: 'italic', marginTop: 12, backgroundColor: '#F5F7F6', padding: 10, borderRadius: 10 },

  micWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 50, height: 50, borderRadius: 25, backgroundColor: '#E0433B' },
  micButton: {
    backgroundColor: '#0C9C4C',
    width: 50, height: 50, borderRadius: 25,
    justifyContent: 'center', alignItems: 'center',
  },
  micButtonActive: { backgroundColor: '#E0433B' },
  micIcon: { fontSize: 21 },
  typeInsteadLink: { color: '#0C9C4C', fontSize: 13, fontWeight: '700' },

  // Floating action button
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#0C9C4C',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0C9C4C',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  fabIcon: { color: '#FFFFFF', fontSize: 30, fontWeight: '400', marginTop: -2 },
});

export default HomeScreen;