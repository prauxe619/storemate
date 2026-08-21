import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, ScrollView, Animated, Image, TextInput, KeyboardAvoidingView, Platform, useWindowDimensions, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppAlert } from '../components/AppAlert';
import { Q } from '@nozbe/watermelondb';
import { database } from '../core/database';
import { syncWithCloud } from '../core/sync/sync';
import POSScreen from '../screens/POSScreen';
import NetInfo from '@react-native-community/netinfo';
import KhataScreen from '../screens/KhataScreen';
import LowStockWidget from '../components/LowStockWidget';
import ManualEntryScreen from '../screens/Manualentryscreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { executeAIAction, confirmPendingSale } from '../core/ai/IntentHandler';
import { SpeechEngine } from '../core/speech/SpeechEngine';
import { BASE_URL } from '../config/api';
import { parseVoiceCommand } from '../core/ai/VoiceCommandRouter';
import TelemetryService from '../services/TelemetryService';
import { requireCurrentUserId } from '../core/auth/localUser';

const PROFILE_KEY_PREFIX = 'storemate_profile_';

const sendWhatsAppReceipt = (cart, totalAmount, customerPhone, paymentMethod, customerName, oldBalance = 0, discount = 0) => {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  let receiptText = `🏪 *COUNTR SHOP INVOICE*\n📅 Date: ${today}\n━━━━━━━━━━━━━━━━━━\n\n🛒 *ITEMS*\n`;
  cart.forEach((item, index) => { receiptText += `${index + 1}. *${item.name}*\n   ${item.qty} × ₹${item.price} = ₹${item.price * item.qty}\n`; });
  receiptText += `\n━━━━━━━━━━━━━━━━━━\n`;
  if (discount > 0) receiptText += `🏷️ *Discount:* ${discount}%\n`;
  if (paymentMethod === 'KHATA') { receiptText += `🧾 *Current Bill:* ₹${totalAmount}\n👤 *Customer:* ${customerName.trim()}\n📖 *Payment:* Udhaar / Khata\n\n🚨 *TOTAL BALANCE: ₹${totalAmount}*\n`; } 
  else { receiptText += `🧾 *Total Paid:* ₹${totalAmount}\n💵 *Payment:* Cash / UPI\n`; }
  receiptText += `\n🙏 *Thank you for your visit!*\n\n━━━━━━━━━━━━━━━━━━\nPowered by *Countr* — your smart shop assistant.`;
  let formattedPhone = String(customerPhone || '').replace(/\D/g, ''); if (formattedPhone.length === 10) formattedPhone = `91${formattedPhone}`;
  if (!formattedPhone) return;
  Linking.openURL(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(receiptText)}`).catch(err => console.error('Could not open WhatsApp', err));
};

const HomeScreen = () => {
  const { showAlert } = useAppAlert();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const screenPadding = windowWidth < 360 ? 14 : windowWidth < 600 ? 18 : 26;

  const [isSyncing, setIsSyncing] = useState(false);
  const [showPOS, setShowPOS] = useState(false);
  const [showKhata, setShowKhata] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualEntryPrefill, setManualEntryPrefill] = useState('');
  const [todaySales, setTodaySales] = useState(0);
  const [pendingKhata, setPendingKhata] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [aiStatus, setAiStatus] = useState('Tap the mic and speak');
  const [transcribedText, setTranscribedText] = useState('');
  const [shopName, setShopName] = useState('Your Store');
  const [avatarUri, setAvatarUri] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [onboardingPhone, setOnboardingPhone] = useState('');
  const [onboardingUpi, setOnboardingUpi] = useState('');
  const [isSavingOnboarding, setIsSavingOnboarding] = useState(false);

  const [pendingSaleItem, setPendingSaleItem] = useState(null);
  const [checkoutPhone, setCheckoutPhone] = useState('');
  const [checkoutCustomer, setCheckoutCustomer] = useState('');
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const isProcessingCommand = useRef(false);
  const isModalOpen = useRef(false);

  useEffect(() => { isModalOpen.current = showPOS || showKhata || showManualEntry || showOnboardingModal || !!pendingSaleItem; }, [showPOS, showKhata, showManualEntry, showOnboardingModal, pendingSaleItem]);
  const getProfileKey = userId => `${PROFILE_KEY_PREFIX}${userId}`;

  useEffect(() => {
    if (showPOS || showKhata || showManualEntry || showOnboardingModal || pendingSaleItem) { setIsListening(false); isProcessingCommand.current = false; SpeechEngine.stop().catch(() => {}); }
  }, [showPOS, showKhata, showManualEntry, showOnboardingModal, pendingSaleItem]);

  useEffect(() => {
    let loop;
    if (isListening) { pulseAnim.setValue(0); loop = Animated.loop(Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: true })); loop.start(); } 
    else pulseAnim.setValue(0);
    return () => { if (loop) loop.stop(); };
  }, [isListening, pulseAnim]);

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.30, 0] });

  const fetchMetrics = async () => {
    try {
      const ownerId = await requireCurrentUserId();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const sales = await database.get('sales_transactions').query(Q.where('owner_id', ownerId), Q.where('created_at', Q.gte(today.getTime()))).fetch();
      setTodaySales(sales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0));
      const entries = await database.get('ledger_entries').query(Q.where('owner_id', ownerId)).fetch();
      let totalKhata = 0;
      entries.forEach(entry => { if (entry.entryType === 'CREDIT') totalKhata += Number(entry.amount || 0); if (entry.entryType === 'PAYMENT') totalKhata -= Number(entry.amount || 0); });
      setPendingKhata(Math.max(totalKhata, 0));
    } catch (error) { console.error('Metrics error:', error); }
  };

  const loadProfileData = async () => {
    try {
      const ownerId = await requireCurrentUserId(); setCurrentUserId(ownerId);
      const profileKey = getProfileKey(ownerId);
      const storedProfile = await AsyncStorage.getItem(profileKey);
      let profile = null;
      if (storedProfile) { try { profile = JSON.parse(storedProfile); } catch (error) { console.warn('Profile JSON invalid:', error); } }
      if (profile) {
        setShopName(profile.shopName || 'Your Store'); setAvatarUri(profile.avatarUri || null); setOnboardingPhone(profile.phone || ''); setOnboardingUpi(profile.upiId || '');
        if (!profile.onboardingCompleted && (!profile.phone || !profile.upiId)) setShowOnboardingModal(true); return;
      }
      setShopName('Your Store'); setAvatarUri(null); setOnboardingPhone(''); setOnboardingUpi('');
      const token = await AsyncStorage.getItem('userToken');
      if (token) {
        TelemetryService.setAuthToken(token);
        try {
          const response = await fetch(`${BASE_URL}/api/v1/auth/profile`, { method: 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
          if (response.ok) {
            const data = await response.json();
            const serverProfile = { email: data.email || '', shopName: data.shop_name || 'Your Store', phone: data.phone || '', address: data.address || '', avatarUri: data.avatar_uri || data.avatarUrl || null, upiId: data.upi_id || '', onboardingCompleted: Boolean(data.phone && data.upi_id) };
            await AsyncStorage.setItem(profileKey, JSON.stringify(serverProfile));
            setShopName(serverProfile.shopName); setAvatarUri(serverProfile.avatarUri); setOnboardingPhone(serverProfile.phone); setOnboardingUpi(serverProfile.upiId);
            if (!serverProfile.phone || !serverProfile.upiId) setShowOnboardingModal(true);
          }
        } catch (error) { console.log('Profile server unavailable. Continuing offline.'); setShowOnboardingModal(true); }
      } else setShowOnboardingModal(true);
    } catch (error) { console.error('Failed to load profile:', error); }
  };

  const autoSyncBackground = async () => {
    if (isSyncing) return;
    try { setIsSyncing(true); await syncWithCloud(); setIsSyncing(false); } 
    catch (error) { setIsSyncing(false); TelemetryService.logError('offline_sync', error.message, error.stack); }
  };

  useEffect(() => {
    fetchMetrics(); loadProfileData();
    const unsubscribeNetInfo = NetInfo.addEventListener(state => {
      const currentlyOffline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(previousOffline => { if (previousOffline === true && currentlyOffline === false) autoSyncBackground(); return currentlyOffline; });
    });

    const partialSub = SpeechEngine.onPartialResult(text => { if (isModalOpen.current) return; setTranscribedText(text); setAiStatus('Listening…'); });
    const finalSub = SpeechEngine.onFinalResult(async text => {
      if (isModalOpen.current || isProcessingCommand.current) return;
      isProcessingCommand.current = true; setTranscribedText(text); setIsListening(false);
      try { await processVoiceCommand(text); } finally { isProcessingCommand.current = false; }
    });

    const errorSub = SpeechEngine.onError(code => {
      if (isModalOpen.current) return; setIsListening(false); isProcessingCommand.current = false;
      let errorMsg = `Error Code: ${code}`;
      if (code === 6) errorMsg = "Speech timeout (didn't hear anything)";
      if (code === 7) errorMsg = 'No match (speak louder/clearer)';
      if (code === 8) errorMsg = 'Google Speech server busy';
      if (code === 9) errorMsg = 'Insufficient permissions';
      setAiStatus(`Mic failed: ${errorMsg}`);
      TelemetryService.logError('voice_speech', errorMsg, null, 'WARNING');
      TelemetryService.trackEvent('voice_speech_error', 'voice', { error_code: code, error_message: errorMsg });
    });

    return () => { unsubscribeNetInfo(); partialSub.remove(); finalSub.remove(); errorSub.remove(); SpeechEngine.stop().catch(() => {}); };
  }, []);

  const processVoiceCommand = async text => {
    const startTime = Date.now(); setAiStatus('Thinking...');
    try {
      const safeVoiceText = typeof text === 'string' ? text.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 500) : '';
      if (!safeVoiceText) { setAiStatus("I didn't hear a command."); return; }

      const ownerId = await requireCurrentUserId();
      const inventoryItems = await database.get('inventory_items').query(Q.where('owner_id', ownerId)).fetch();
      const inventoryNames = inventoryItems.map(item => String(item.productName || '').trim().slice(0, 150)).filter(Boolean);
      const ledgerEntries = await database.get('ledger_entries').query(Q.where('owner_id', ownerId)).fetch();
      const customerNames = [...new Set(ledgerEntries.map(entry => String(entry.customerId || '').trim()).filter(Boolean))];

      const aiData = await parseVoiceCommand({ text: safeVoiceText, inventory: inventoryItems, inventoryNames, customerNames });
      
      const cmd = (aiData && typeof aiData.command === 'object') ? aiData.command : {};
      const parsed = (aiData && typeof aiData.parsed === 'object') ? aiData.parsed : aiData || {};
      
      const intent = cmd.intent ?? parsed.intent ?? aiData?.intent ?? 'unknown';
      const product = cmd.product ?? parsed.product ?? aiData?.product ?? null;
      const qty = cmd.quantity ?? cmd.qty ?? parsed.quantity ?? parsed.qty ?? aiData?.qty ?? aiData?.quantity ?? null;
      const unit = cmd.unit ?? parsed.unit ?? aiData?.unit ?? null;
      const price_hint = cmd.price_hint ?? parsed.price_hint ?? aiData?.price_hint ?? null;
      const new_price = cmd.new_price ?? parsed.new_price ?? aiData?.new_price ?? null;
      const amount = cmd.amount ?? parsed.amount ?? aiData?.amount ?? null;
      const discount_percent = cmd.discount_percent ?? parsed.discount_percent ?? aiData?.discount_percent ?? null;
      const customer_name = cmd.customer_name ?? parsed.customer_name ?? aiData?.customer_name ?? null;
      const payment_type = cmd.payment_type ?? parsed.payment_type ?? aiData?.payment_type ?? null;
      const time_period = cmd.time_period ?? parsed.time_period ?? aiData?.time_period ?? null;

      if (intent === 'unknown') { 
        setAiStatus('Command not recognized. Try "Rahul ko ₹500 udhaar"'); 
        return; 
      }

      if (intent === 'pos.add_item' || intent === 'ui.open_billing') {
        setShowPOS(true); setAiStatus('Opening Sale...'); return;
      }

      setAiStatus('Updating your shop...');
      const resultMessage = await executeAIAction({ intent, product, customer_name, qty, unit, price_hint, new_price, amount, discount_percent, payment_type, time_period });

      if (resultMessage && typeof resultMessage === 'object' && resultMessage.needsConfirmation) {
        setAiStatus(resultMessage.message);
        setCheckoutCustomer(resultMessage.pendingSale.customer_name || '');
        setCheckoutPhone('');
        setPendingSaleItem(resultMessage.pendingSale);
        return;
      }

      setAiStatus(typeof resultMessage === 'string' ? resultMessage : (resultMessage?.message || 'Done ✓'));
      await fetchMetrics();

    } catch (error) {
      console.error('Voice Pipeline Error:', error); setAiStatus(error?.message || 'Could not process that command.');
    }
  };

  const handleConfirmSale = async (paymentType) => {
    if (paymentType === 'KHATA' && !checkoutCustomer.trim()) return showAlert('Required', 'Please enter a customer name for Udhaar.');
    setCheckoutProcessing(true);
    try {
        const updatedSale = { ...pendingSaleItem, customer_name: checkoutCustomer.trim() };
        const resultMsg = await confirmPendingSale(updatedSale, paymentType);
        if (checkoutPhone.length >= 10) {
            const product = await database.get('inventory_items').find(updatedSale.itemId);
            sendWhatsAppReceipt([{ name: product.productName, qty: updatedSale.qty, price: product.sellingPrice }], updatedSale.totalSaleValue, checkoutPhone, paymentType, updatedSale.customer_name);
        }
        setAiStatus(resultMsg); setPendingSaleItem(null); fetchMetrics();
    } catch (error) { showAlert('Error', error.message); } 
    finally { setCheckoutProcessing(false); }
  };

  const safeMicPress = async () => {
    if (isModalOpen.current) return;
    try {
      if (isListening) { await SpeechEngine.stop(); setIsListening(false); setAiStatus('Tap the mic and speak'); } 
      else { setTranscribedText(''); setAiStatus('Listening...'); setIsListening(true); await SpeechEngine.start(); }
    } catch (error) {
      setIsListening(false); handleVoiceUnavailable(error.message || 'Microphone permission denied.');
    }
  };

  const handleVoiceUnavailable = reason => {
    setAiStatus('Voice unavailable');
    showAlert('Microphone Error', `${reason}\n\nPlease check Settings > Apps > StoreMate > Permissions > Microphone.`, [{ text: 'Use manual entry', onPress: () => setShowManualEntry(true) }, { text: 'OK', style: 'cancel' }]);
  };

  const handleManualSync = async () => {
    try { setIsSyncing(true); const result = await syncWithCloud(); setIsSyncing(false); showAlert(result?.success ? 'Synced ✓' : 'Sync paused', result?.message || (result?.success ? 'Your shop is backed up.' : 'Could not reach server.')); } 
    catch (error) { setIsSyncing(false); showAlert('Error', error.message); }
  };

  const handleSaveOnboarding = async () => {
    if (!onboardingPhone || onboardingPhone.length !== 10) return showAlert('Validation', 'Please enter a valid 10-digit mobile number.');
    if (!onboardingUpi || !onboardingUpi.includes('@')) return showAlert('Validation', 'Please enter a valid UPI ID.');
    setIsSavingOnboarding(true);
    try {
      const ownerId = currentUserId || (await requireCurrentUserId()); setCurrentUserId(ownerId);
      const profileKey = getProfileKey(ownerId), existingProfileRaw = await AsyncStorage.getItem(profileKey);
      let existingProfile = {}; if (existingProfileRaw) { try { existingProfile = JSON.parse(existingProfileRaw); } catch { existingProfile = {}; } }
      const updatedProfile = { ...existingProfile, shopName: shopName || 'Your Store', phone: onboardingPhone, upiId: onboardingUpi, avatarUri: avatarUri, onboardingCompleted: true };
      await AsyncStorage.setItem(profileKey, JSON.stringify(updatedProfile));
      const token = await AsyncStorage.getItem('userToken');
      if (token) { try { await fetch(`${BASE_URL}/api/v1/auth/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ shop_name: shopName, phone: onboardingPhone, upi_id: onboardingUpi }) }); } catch {} }
      setShowOnboardingModal(false); showAlert('Ready 🎉', 'Your shop details have been saved.');
    } catch (error) { showAlert('Error', error.message || 'Could not save details.'); } 
    finally { setIsSavingOnboarding(false); }
  };

  const handlePOSClose = () => { SpeechEngine.stop().catch(() => {}); setShowPOS(false); fetchMetrics(); };
  const initial = (shopName || 'S').trim().charAt(0).toUpperCase();

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 8), paddingBottom: Math.max(insets.bottom, 12) }]}>
      {isOffline && (<View style={styles.offlineBanner}><View style={styles.offlineDot} /><Text style={styles.offlineText}>Offline mode · Your data is safe on this device</Text></View>)}
      <View style={[styles.topBar, { paddingHorizontal: screenPadding }]}>
        <View style={styles.avatarCircle}>{avatarUri ? (<Image source={{ uri: avatarUri }} style={styles.avatarImage} />) : (<Text style={styles.avatarText}>{initial}</Text>)}</View>
        <View style={styles.storeInfo}><Text style={styles.greeting}>NAMASTE 👋</Text><Text style={styles.storeName} numberOfLines={1}>{shopName}</Text><View style={styles.statusRow}><View style={[styles.statusDot, isOffline && styles.statusDotOffline]} /><Text style={styles.syncStatus}>{isSyncing ? 'Syncing shop...' : isOffline ? 'Offline · Ready' : 'All data backed up'}</Text></View></View>
        <TouchableOpacity onPress={handleManualSync} disabled={isSyncing} style={styles.syncButton} activeOpacity={0.75}>{isSyncing ? (<ActivityIndicator color="#5E9227" size="small" />) : (<Text style={styles.syncIcon}>↻</Text>)}</TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 105, 125) }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={[styles.heroCard, isListening && styles.heroCardListening, { marginHorizontal: screenPadding }]}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroText}>
              <View style={styles.heroEyebrowRow}><View style={styles.heroGreenDot} /><Text style={styles.heroEyebrow}>COUNTR VOICE</Text></View>
              <Text style={styles.heroTitle}>Boliyega.</Text><Text style={styles.heroTitleSecond}>Countr karega.</Text>
              <Text style={styles.heroDescription}>Sale, khata, stock aur customer — bas bolkar manage karein.</Text>
            </View>
            <View style={styles.micArea}>
              {isListening && (<Animated.View pointerEvents="none" style={[styles.pulseRing, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />)}
              <TouchableOpacity style={[styles.micButton, isListening && styles.micButtonListening]} onPress={safeMicPress} activeOpacity={0.85}>
                <View style={styles.micIcon}><View style={[styles.micCapsule, isListening && styles.micCapsuleListening]} /><View style={[styles.micArc, isListening && styles.micArcListening]} /><View style={[styles.micStem, isListening && styles.micStemListening]} /><View style={[styles.micBase, isListening && styles.micBaseListening]} /></View>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.voiceStatusBox}>
            <View style={styles.voiceStatusIcon}><View style={styles.smallMicIcon}><View style={styles.smallMicCapsule} /><View style={styles.smallMicArc} /><View style={styles.smallMicStem} /><View style={styles.smallMicBase} /></View></View>
            <View style={styles.voiceStatusTextWrap}><Text style={styles.voiceStatus} numberOfLines={2}>{aiStatus}</Text>{!!transcribedText && (<Text style={styles.transcribed} numberOfLines={1}>“{transcribedText}”</Text>)}</View>
          </View>
          <View style={styles.commandExamples}><Text style={styles.tryText}>TRY:</Text><Text style={styles.exampleText}>“Ravi ko ₹500 udhaar”</Text><Text style={styles.exampleDot}>·</Text><Text style={styles.exampleText}>“2 Maggi add karo”</Text></View>
        </View>
        <View style={[styles.sectionWrap, { marginHorizontal: screenPadding }]}>
          <View style={styles.sectionHeading}><View><Text style={styles.sectionEyebrow}>TODAY</Text><Text style={styles.sectionTitle}>Shop at a glance</Text></View></View>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}><View style={styles.summaryIconGreen}><Text style={styles.summaryIconText}>₹</Text></View><Text style={styles.summaryLabel}>TODAY'S SALES</Text><Text style={styles.summaryValue}>₹{todaySales.toLocaleString('en-IN')}</Text><Text style={styles.summaryHint}>Aaj ki bikri</Text></View>
            <TouchableOpacity style={styles.summaryCard} onPress={() => setShowKhata(true)} activeOpacity={0.8}><View style={styles.summaryIconRed}><Text style={styles.summaryIconText}>₹</Text></View><Text style={styles.summaryLabel}>YOU'LL GET</Text><Text style={[styles.summaryValue, { color: pendingKhata > 0 ? '#C94D46' : '#5E9227' }]}>₹{pendingKhata.toLocaleString('en-IN')}</Text><Text style={styles.summaryHint}>Udhaar baki · Tap</Text></TouchableOpacity>
          </View>
        </View>
        <View style={[styles.sectionWrap, { marginHorizontal: screenPadding }]}>
          <View style={styles.sectionHeading}><View><Text style={styles.sectionEyebrow}>QUICK ACTIONS</Text><Text style={styles.sectionTitle}>Do it in one tap</Text></View></View>
          <View style={styles.quickGrid}>
            <TouchableOpacity style={styles.quickCard} onPress={() => setShowPOS(true)} activeOpacity={0.8}><View style={styles.quickIconGreen}><Text style={styles.quickIconText}>🛒</Text></View><View style={styles.quickText}><Text style={styles.quickTitle}>New Sale</Text><Text style={styles.quickSub}>Billing karein</Text></View><Text style={styles.quickArrow}>→</Text></TouchableOpacity>
            <TouchableOpacity style={styles.quickCard} onPress={() => setShowKhata(true)} activeOpacity={0.8}><View style={styles.quickIconOrange}><Text style={styles.quickIconText}>📒</Text></View><View style={styles.quickText}><Text style={styles.quickTitle}>Khata</Text><Text style={styles.quickSub}>Udhaar manage</Text></View><Text style={styles.quickArrow}>→</Text></TouchableOpacity>
            <TouchableOpacity style={styles.quickCard} onPress={() => { setManualEntryPrefill(''); setShowManualEntry(true); }} activeOpacity={0.8}><View style={styles.quickIconBlue}><Text style={styles.quickIconText}>✍</Text></View><View style={styles.quickText}><Text style={styles.quickTitle}>Manual Entry</Text><Text style={styles.quickSub}>Type karke add</Text></View><Text style={styles.quickArrow}>→</Text></TouchableOpacity>
          </View>
        </View>
        <View style={[styles.sectionWrap, { marginHorizontal: screenPadding }]}><View style={styles.sectionHeading}><View><Text style={styles.sectionEyebrow}>INVENTORY</Text><Text style={styles.sectionTitle}>Stock needs attention</Text></View></View><LowStockWidget /></View>
        <View style={[styles.helpCard, { marginHorizontal: screenPadding }]}><View style={styles.helpIcon}><Text style={styles.helpIconText}>✨</Text></View><View style={styles.helpText}><Text style={styles.helpTitle}>Shop ko bolkar chalao</Text><Text style={styles.helpSub}>Sale, stock, khata aur customer — Countr ko normal language mein bolo.</Text></View></View>
      </ScrollView>
      <TouchableOpacity style={[styles.fab, { bottom: Math.max(insets.bottom + 18, 20) }]} onPress={() => setShowPOS(true)} activeOpacity={0.85}><Text style={styles.fabPlus}>+</Text><Text style={styles.fabText}>Sale</Text></TouchableOpacity>
      
      {/* Checkout Popup */}
      <Modal visible={!!pendingSaleItem} transparent animationType="fade" onRequestClose={() => setPendingSaleItem(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKeyboardContainer}>
          <View style={styles.modalOverlay}>
            <View style={styles.checkoutPopupCard}>
              <Text style={styles.checkoutPopupTitle}>Confirm Sale</Text>
              <Text style={styles.checkoutPopupAmount}>₹{pendingSaleItem?.totalSaleValue}</Text>
              <Text style={styles.inputLabel}>CUSTOMER NAME (For Udhaar)</Text>
              <TextInput style={styles.modalInput} placeholder="Rahul" placeholderTextColor="#9AA39D" value={checkoutCustomer} onChangeText={setCheckoutCustomer} />
              <Text style={styles.inputLabel}>WHATSAPP NUMBER (Optional)</Text>
              <TextInput style={styles.modalInput} placeholder="9876543210" placeholderTextColor="#9AA39D" keyboardType="phone-pad" maxLength={10} value={checkoutPhone} onChangeText={setCheckoutPhone} />
              <View style={styles.checkoutBtnRow}>
                <TouchableOpacity style={[styles.khataBtn, checkoutProcessing && styles.checkoutDisabled]} onPress={() => handleConfirmSale('KHATA')} disabled={checkoutProcessing}>
                  <Text style={styles.khataBtnTitle}>Udhaar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cashBtn, checkoutProcessing && styles.checkoutDisabled]} onPress={() => handleConfirmSale('CASH')} disabled={checkoutProcessing}>
                  <Text style={styles.cashBtnTitle}>Cash / UPI</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.cancelPopupBtn} onPress={() => setPendingSaleItem(null)}><Text style={styles.cancelPopupText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showPOS} animationType="slide" onRequestClose={handlePOSClose}><POSScreen onClose={handlePOSClose} /></Modal>
      <Modal visible={showKhata} animationType="slide" onRequestClose={() => { SpeechEngine.stop().catch(() => {}); setShowKhata(false); fetchMetrics(); }}><KhataScreen onClose={() => { SpeechEngine.stop().catch(() => {}); setShowKhata(false); fetchMetrics(); }} /></Modal>
      <Modal visible={showManualEntry} animationType="slide" onRequestClose={() => { SpeechEngine.stop().catch(() => {}); setShowManualEntry(false); }}><ManualEntryScreen initialQuery={manualEntryPrefill} onClose={() => { SpeechEngine.stop().catch(() => {}); setShowManualEntry(false); }} onSaved={() => { setAiStatus('Entry saved ✓'); fetchMetrics(); }} /></Modal>
      <Modal visible={showOnboardingModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowOnboardingModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKeyboardContainer}>
          <ScrollView contentContainerStyle={[styles.modalOverlay, { paddingTop: Math.max(insets.top + 20, 30), paddingBottom: Math.max(insets.bottom + 20, 30) }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.onboardingCard, { width: Math.min(windowWidth - 32, 410) }]}>
              <View style={styles.onboardingIcon}><Text style={styles.onboardingIconText}>🏪</Text></View><Text style={styles.onboardingTitle}>Let's set up your shop</Text><Text style={styles.onboardingSub}>Bas ek baar details add karein. Countr baaki shop ka kaam easy bana dega.</Text>
              <Text style={styles.inputLabel}>MOBILE NUMBER</Text><TextInput style={styles.modalInput} placeholder="9876543210" placeholderTextColor="#9AA39D" keyboardType="number-pad" maxLength={10} value={onboardingPhone} onChangeText={setOnboardingPhone} returnKeyType="next" />
              <Text style={styles.inputLabel}>SHOP UPI ID</Text><TextInput style={styles.modalInput} placeholder="9876543210@paytm" placeholderTextColor="#9AA39D" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={onboardingUpi} onChangeText={setOnboardingUpi} returnKeyType="done" />
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveOnboarding} disabled={isSavingOnboarding} activeOpacity={0.85}>{isSavingOnboarding ? (<ActivityIndicator color="#FFFFFF" />) : (<Text style={styles.modalSaveBtnText}>Save & Get Started →</Text>)}</TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F5' },
  offlineBanner: { minHeight: 32, backgroundColor: '#1E2721', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  offlineDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: '#F0B34A', marginRight: 7 },
  offlineText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '700' },
  topBar: { minHeight: 70, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E8ECE8', paddingVertical: 10 },
  avatarCircle: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#B8FF3D', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  avatarImage: { width: 44, height: 44, borderRadius: 15 },
  avatarText: { color: '#173018', fontSize: 18, fontWeight: '900' },
  storeInfo: { flex: 1, minWidth: 0, marginLeft: 11, marginRight: 8 },
  greeting: { color: '#73943C', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.4, marginBottom: 1 },
  storeName: { color: '#142019', fontSize: 16, fontWeight: '900' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statusDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: '#63A72E', marginRight: 5 },
  statusDotOffline: { backgroundColor: '#D99935' },
  syncStatus: { color: '#89928C', fontSize: 8.5, fontWeight: '600' },
  syncButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#F2F6F0', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  syncIcon: { color: '#5D9029', fontSize: 21, fontWeight: '700' },
  scrollContent: { paddingTop: 15 },
  heroCard: { backgroundColor: '#FFFFFF', borderRadius: 24, borderWidth: 1, borderColor: '#DFE7DE', padding: 18, overflow: 'hidden', shadowColor: '#17251B', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.045, shadowRadius: 14, elevation: 2 },
  heroCardListening: { borderColor: '#9BCB54', backgroundColor: '#FCFFF9' },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', minHeight: 142 },
  heroText: { flex: 1, minWidth: 0, paddingRight: 10 },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  heroGreenDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: '#8DBE3F', marginRight: 6 },
  heroEyebrow: { color: '#71983B', fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  heroTitle: { color: '#142019', fontSize: 29, lineHeight: 31, fontWeight: '900', letterSpacing: -1 },
  heroTitleSecond: { color: '#6C9137', fontSize: 25, lineHeight: 28, fontWeight: '800', letterSpacing: -0.8 },
  heroDescription: { color: '#78827B', fontSize: 10.5, lineHeight: 16, marginTop: 8, maxWidth: 245 },
  micArea: { width: 91, height: 91, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pulseRing: { position: 'absolute', width: 78, height: 78, borderRadius: 39, backgroundColor: '#B8FF3D' },
  micButton: { width: 69, height: 69, borderRadius: 23, backgroundColor: '#B8FF3D', alignItems: 'center', justifyContent: 'center', shadowColor: '#6E982C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 9, elevation: 3 },
  micButtonListening: { backgroundColor: '#E9685E' },
  micIcon: { width: 34, height: 38, alignItems: 'center', justifyContent: 'flex-end', position: 'relative' },
  micCapsule: { position: 'absolute', top: 0, left: 10, width: 14, height: 23, borderRadius: 8, backgroundColor: '#173018' },
  micCapsuleListening: { backgroundColor: '#FFFFFF' },
  micArc: { position: 'absolute', left: 5, top: 12, width: 24, height: 19, borderWidth: 3, borderTopWidth: 0, borderColor: '#173018', borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  micArcListening: { borderColor: '#FFFFFF' },
  micStem: { position: 'absolute', bottom: 2, left: 15, width: 3, height: 9, borderRadius: 2, backgroundColor: '#173018' },
  micStemListening: { backgroundColor: '#FFFFFF' },
  micBase: { position: 'absolute', bottom: 0, left: 9, width: 15, height: 3, borderRadius: 2, backgroundColor: '#173018' },
  micBaseListening: { backgroundColor: '#FFFFFF' },
  voiceStatusBox: { backgroundColor: '#F5F8F3', borderRadius: 15, borderWidth: 1, borderColor: '#E6ECE3', minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 8, marginTop: 5 },
  voiceStatusIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#E6F2DC', alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  smallMicIcon: { width: 18, height: 20, alignItems: 'center', justifyContent: 'flex-end', position: 'relative' },
  smallMicCapsule: { position: 'absolute', top: 0, left: 5, width: 8, height: 12, borderRadius: 5, backgroundColor: '#69952F' },
  smallMicArc: { position: 'absolute', left: 2, top: 7, width: 14, height: 10, borderWidth: 2, borderTopWidth: 0, borderColor: '#69952F', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  smallMicStem: { position: 'absolute', bottom: 2, left: 8, width: 2, height: 5, borderRadius: 1, backgroundColor: '#69952F' },
  smallMicBase: { position: 'absolute', bottom: 0, left: 5, width: 8, height: 2, borderRadius: 1, backgroundColor: '#69952F' },
  voiceStatusIconText: { color: '#69952F', fontSize: 12, fontWeight: '900' },
  voiceStatusTextWrap: { flex: 1, minWidth: 0 },
  voiceStatus: { color: '#39463E', fontSize: 10.5, fontWeight: '700', lineHeight: 15 },
  transcribed: { color: '#88918B', fontSize: 9, fontStyle: 'italic', marginTop: 2 },
  commandExamples: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 10 },
  tryText: { color: '#9AA39D', fontSize: 7.5, fontWeight: '900', letterSpacing: 1, marginRight: 6 },
  exampleText: { color: '#63756A', fontSize: 8.5, fontWeight: '700' },
  exampleDot: { color: '#AEB7B0', fontSize: 9, marginHorizontal: 5 },
  sectionWrap: { marginTop: 22 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  sectionEyebrow: { color: '#73983D', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.5, marginBottom: 3 },
  sectionTitle: { color: '#17231B', fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  summaryGrid: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, minHeight: 136, backgroundColor: '#FFFFFF', borderRadius: 19, borderWidth: 1, borderColor: '#E0E6E0', padding: 13, shadowColor: '#17251B', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.03, shadowRadius: 9, elevation: 1 },
  summaryIconGreen: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#E8F5DE', alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  summaryIconRed: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#FFF0ED', alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  summaryIconText: { color: '#60912C', fontSize: 14, fontWeight: '900' },
  summaryLabel: { color: '#8B948E', fontSize: 7.5, fontWeight: '900', letterSpacing: 1, marginBottom: 3 },
  summaryValue: { color: '#17231B', fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  summaryHint: { color: '#9AA39D', fontSize: 8.5, marginTop: 5, lineHeight: 12 },
  quickGrid: { gap: 8 },
  quickCard: { minHeight: 66, backgroundColor: '#FFFFFF', borderRadius: 17, borderWidth: 1, borderColor: '#E0E6E0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, shadowColor: '#17251B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.025, shadowRadius: 7, elevation: 1 },
  quickIconGreen: { width: 43, height: 43, borderRadius: 13, backgroundColor: '#E9F5E1', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  quickIconOrange: { width: 43, height: 43, borderRadius: 13, backgroundColor: '#FFF0DD', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  quickIconBlue: { width: 43, height: 43, borderRadius: 13, backgroundColor: '#EAF1FC', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  quickIconText: { fontSize: 18 },
  quickText: { flex: 1, minWidth: 0 },
  quickTitle: { color: '#17231B', fontSize: 12.5, fontWeight: '900' },
  quickSub: { color: '#8A948E', fontSize: 8.5, marginTop: 3 },
  quickArrow: { color: '#8A958E', fontSize: 21, fontWeight: '300', paddingLeft: 7 },
  helpCard: { backgroundColor: '#EEF6E8', borderRadius: 20, borderWidth: 1, borderColor: '#DDEAD5', padding: 14, flexDirection: 'row', alignItems: 'center', marginTop: 22 },
  helpIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  helpIconText: { fontSize: 18 },
  helpText: { flex: 1, minWidth: 0 },
  helpTitle: { color: '#314329', fontSize: 12, fontWeight: '900' },
  helpSub: { color: '#70806D', fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  fab: { position: 'absolute', right: 18, minWidth: 77, height: 52, borderRadius: 18, backgroundColor: '#B8FF3D', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, shadowColor: '#638A2B', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  fabPlus: { color: '#173018', fontSize: 22, fontWeight: '500', marginRight: 5 },
  fabText: { color: '#173018', fontSize: 11, fontWeight: '900' },
  modalKeyboardContainer: { flex: 1, backgroundColor: 'rgba(19,29,22,0.48)' },
  modalOverlay: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  onboardingCard: { backgroundColor: '#FFFFFF', borderRadius: 25, padding: 22, borderWidth: 1, borderColor: '#DFE6DE', shadowColor: '#000000', shadowOpacity: 0.15, shadowRadius: 25, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  onboardingIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#EAF5E1', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  onboardingIconText: { fontSize: 25 },
  onboardingTitle: { color: '#142019', fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  onboardingSub: { color: '#7B867F', fontSize: 10, lineHeight: 15, marginTop: 5, marginBottom: 18 },
  inputLabel: { color: '#7D8981', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.1, marginBottom: 5 },
  modalInput: { width: '100%', minHeight: 49, borderWidth: 1, borderColor: '#DDE4DD', borderRadius: 13, paddingHorizontal: 13, fontSize: 12, fontWeight: '600', backgroundColor: '#F7F9F6', color: '#17231B', marginBottom: 13 },
  modalSaveBtn: { width: '100%', minHeight: 52, borderRadius: 15, backgroundColor: '#B8FF3D', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  modalSaveBtnText: { color: '#173018', fontSize: 12.5, fontWeight: '900' },
  checkoutPopupCard: { backgroundColor: '#FFFFFF', borderRadius: 25, padding: 22, width: '100%', maxWidth: 410, alignSelf: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 25, elevation: 8 },
  checkoutPopupTitle: { color: '#142019', fontSize: 21, fontWeight: '900', textAlign: 'center', marginBottom: 5 },
  checkoutPopupAmount: { color: '#5E9227', fontSize: 32, fontWeight: '900', textAlign: 'center', marginBottom: 20 },
  cancelPopupBtn: { marginTop: 15, paddingVertical: 10, alignItems: 'center' },
  cancelPopupText: { color: '#88918B', fontSize: 12, fontWeight: '700' },
  checkoutBtnRow: { flexDirection: 'row', gap: 8 },
  khataBtn: { flex: 0.9, minHeight: 56, borderRadius: 16, backgroundColor: '#FFF0ED', borderWidth: 1, borderColor: '#F1D4D0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  khataBtnTitle: { color: '#D9554D', fontSize: 11, fontWeight: '900' },
  cashBtn: { flex: 1.25, minHeight: 56, borderRadius: 16, backgroundColor: '#B8FF3D', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  cashBtnTitle: { color: '#173018', fontSize: 11, fontWeight: '900' },
  checkoutDisabled: { opacity: 0.5 },
});

export default HomeScreen;