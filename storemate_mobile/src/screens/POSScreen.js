import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, TextInput, Linking, Vibration, Animated, AppState, PermissionsAndroid, Platform, Alert } from 'react-native';
import { useAppAlert } from '../components/AppAlert';
import { requireCurrentUserId } from '../core/auth/localUser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { processPOSVoiceCommand as processPOSVoiceCommandPhase4D } from '../core/ai/POSVoiceIntegrationPhase4D';
import { database } from '../core/database';
import { canConvertUnit, convertQuantity } from '../core/ai/UnitConversion';
import { Q } from '@nozbe/watermelondb';
import { Camera, CameraType } from 'react-native-camera-kit';
import { SpeechEngine } from '../core/speech/SpeechEngine';
import TelemetryService from '../services/TelemetryService';

const COLORS = {
  background: '#F5F7F5', white: '#FFFFFF', ink: '#17231B', dark: '#243129',
  green: '#6C9637', brightGreen: '#B8FF3D', greenSoft: '#EAF5E1', greenBorder: '#DCE9D4',
  red: '#D9554D', redSoft: '#FFF0ED', blue: '#4D78C9', blueSoft: '#EDF3FF',
  orange: '#D99142', orangeSoft: '#FFF3E5', border: '#E1E7E1', borderDark: '#D6DED6',
  muted: '#87918A', mutedLight: '#A0A8A2', surface: '#F8FAF8',
};

const safeVibrate = (duration = 100) => {
  try { if (Vibration && typeof Vibration.vibrate === 'function') Vibration.vibrate(duration); } catch {}
};

const sendWhatsAppReceipt = (cart, totalAmount, customerPhone, paymentMethod, customerName, oldBalance = 0, discount = 0) => {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  let receiptText = `🏪 *COUNTR SHOP INVOICE*\n📅 Date: ${today}\n━━━━━━━━━━━━━━━━━━\n\n🛒 *ITEMS*\n`;
  cart.forEach((item, index) => { receiptText += `${index + 1}. *${item.name}*\n   ${item.qty} × ₹${item.price} = ₹${item.price * item.qty}\n`; });
  receiptText += `\n━━━━━━━━━━━━━━━━━━\n`;
  if (discount > 0) receiptText += `🏷️ *Discount:* ${discount}%\n`;

  if (paymentMethod === 'KHATA') {
    receiptText += `🧾 *Current Bill:* ₹${totalAmount}\n👤 *Customer:* ${customerName.trim()}\n📖 *Payment:* Udhaar / Khata\n\n`;
    if (oldBalance > 0) receiptText += `📊 *Previous Due:* ₹${oldBalance}\n🚨 *TOTAL BALANCE: ₹${totalAmount + oldBalance}*\n`;
    else if (oldBalance < 0) {
      receiptText += `🟢 *Previous Advance:* ₹${Math.abs(oldBalance)}\n`;
      const newTotal = totalAmount + oldBalance;
      receiptText += newTotal > 0 ? `🚨 *TOTAL BALANCE: ₹${newTotal}*\n` : `🟢 *Remaining Advance: ₹${Math.abs(newTotal)}*\n`;
    } else receiptText += `🚨 *TOTAL BALANCE: ₹${totalAmount}*\n`;
  } else {
    receiptText += `🧾 *Total Paid:* ₹${totalAmount}\n💵 *Payment:* Cash / UPI\n`;
  }

  receiptText += `\n🙏 *Thank you for your visit!*\n\n━━━━━━━━━━━━━━━━━━\nPowered by *Countr* — your smart shop assistant.`;
  let formattedPhone = String(customerPhone || '').replace(/\D/g, '');
  if (formattedPhone.length === 10) formattedPhone = `91${formattedPhone}`;
  if (!formattedPhone) return;

  Linking.openURL(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(receiptText)}`).catch(err => console.error('Could not open WhatsApp', err));
};

const POSScreen = ({ onClose }) => {
  const insets = useSafeAreaInsets();
  const { showAlert } = useAppAlert();

  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [availableItems, setAvailableItems] = useState([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [lastScanned, setLastScanned] = useState(null);
  
  const lastScannedRef = useRef(null);
  const isScanningRef = useRef(false);
  const appState = useRef(AppState.currentState);
  
  const inventoryRef = useRef([]);
  const customerNamesRef = useRef([]);
  const isMountedRef = useRef(true);
  const isProcessingCommand = useRef(false);
  const isCheckoutProcessing = useRef(false);

  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [aiStatus, setAiStatus] = useState('Tap Voice Add and speak');
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);
  const [lastAddedName, setLastAddedName] = useState(null);

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const addBounce = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    isMountedRef.current = true;
    SpeechEngine.stop().catch(() => {});

    const partialSub = SpeechEngine.onPartialResult(text => {
      if (!isMountedRef.current) return;
      setAiStatus(`Listening: "${text}"`);
    });

    const finalSub = SpeechEngine.onFinalResult(async text => {
      if (!isMountedRef.current || isProcessingCommand.current) return;
      isProcessingCommand.current = true;
      if (isMountedRef.current) setIsListening(false);
      
      try {
        await processPOSVoiceCommand(text);
      } catch (error) {
        if (isMountedRef.current) {
          console.error('COUNTR speech final callback error:', error);
          setAiStatus('Could not process that command.');
        }
      } finally {
        isProcessingCommand.current = false;
      }
    });

    const errorSub = SpeechEngine.onError(code => {
      if (!isMountedRef.current) return;
      setIsListening(false);
      isProcessingCommand.current = false;
      setAiStatus(`Mic failed (Code ${code})`);
    });

    return () => {
      isMountedRef.current = false;
      isProcessingCommand.current = false;
      try { partialSub?.remove?.(); } catch {}
      try { finalSub?.remove?.(); } catch {}
      try { errorSub?.remove?.(); } catch {}
      SpeechEngine.stop().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/active/) && (nextAppState === 'inactive' || nextAppState === 'background')) {
        setIsScannerOpen(false); isScanningRef.current = false; lastScannedRef.current = null;
      }
      appState.current = nextAppState;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const ownerId = await requireCurrentUserId();
        const items = await database.get('inventory_items').query(Q.where('owner_id', ownerId)).fetch();
        setAvailableItems(items); inventoryRef.current = items;
      } catch (error) {
        TelemetryService.logError('pos_inventory_load', error?.message || 'Inventory load failed', error?.stack);
      }
    };
    fetchInventory();
  }, []);

  useEffect(() => {
    const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
    const discountAmount = subtotal * (Number(discount || 0) / 100);
    setTotal(Math.round(subtotal - discountAmount));
  }, [cart, discount]);

  useEffect(() => {
    let loop;
    if (isListening) {
      pulseAnim.setValue(0);
      loop = Animated.loop(Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: true }));
      loop.start();
    } else pulseAnim.setValue(0);
    return () => loop && loop.stop();
  }, [isListening, pulseAnim]);

  const filteredItems = useMemo(() => {
    const query = String(searchQuery || '').toLowerCase().trim();
    return availableItems.filter(item => {
      const name = String(item.productName || '').toLowerCase(), barcode = item.barcode ? String(item.barcode) : '';
      if (!query) return true; return name.includes(query) || barcode.includes(searchQuery);
    });
  }, [availableItems, searchQuery]);

  const flashAdded = name => {
    setLastAddedName(name); addBounce.setValue(0.85); Animated.spring(addBounce, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
  };

  const addToCart = (product, explicitQty = null, explicitUnit = null) => {
    if (!isMountedRef.current || !product || !product.id) return;
    
    let qtyToAdd = explicitQty || 1;
    if (!Number.isFinite(Number(qtyToAdd)) || Number(qtyToAdd) <= 0) return;

    const productUnit = product.unit || product.unitType || product.stockUnit;
    
    if (explicitUnit && productUnit && String(explicitUnit).toUpperCase() !== String(productUnit).toUpperCase()) {
      if (canConvertUnit(explicitUnit, productUnit)) {
        const converted = convertQuantity(qtyToAdd, explicitUnit, productUnit);
        if (converted !== null) {
          qtyToAdd = converted;
        } else {
          Alert.alert('Unit Error', `Could not convert ${explicitUnit} to ${productUnit}.`);
          return;
        }
      } else {
        Alert.alert('Unit Error', `Cannot mix ${explicitUnit} with ${productUnit}.`);
        return;
      }
    }

    setCart(prevCart => {
      const existingItemIndex = prevCart.findIndex(item => item.id === product.id);
      const currentQtyInCart = existingItemIndex >= 0 ? prevCart[existingItemIndex].qty : 0;

      if (currentQtyInCart + Number(qtyToAdd) > Number(product.quantity)) {
        Alert.alert('Stock Limit ⚠️', `You only have ${product.quantity} ${productUnit || ''} of ${product.productName} left!`); return prevCart;
      }

      let newCart;
      if (existingItemIndex >= 0) {
        newCart = [...prevCart];
        newCart[existingItemIndex] = { ...newCart[existingItemIndex], qty: newCart[existingItemIndex].qty + Number(qtyToAdd), qtyText: (newCart[existingItemIndex].qty + Number(qtyToAdd)).toString() };
      } else {
        newCart = [...prevCart, { id: product.id, name: product.productName, price: Number(product.sellingPrice) || 0, qty: Number(qtyToAdd), qtyText: Number(qtyToAdd).toString(), maxQty: Number(product.quantity) || 0 }];
      }
      return newCart;
    });

    if (isMountedRef.current) setSearchQuery('');
  };

  const processPOSVoiceCommand = async text => {
    const safeSetAiStatus = value => { if (isMountedRef.current) setAiStatus(value); };
    const safeSetCustomerName = value => { if (isMountedRef.current) setCustomerName(value); };
    const safeSetDiscount = value => { if (isMountedRef.current) setDiscount(value); };

    if (!isMountedRef.current) return;
    safeSetAiStatus('Thinking...');
    const startTime = Date.now();

    try {
      const safeText = typeof text === 'string' ? text.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 500) : '';
      if (!safeText) { safeSetAiStatus("Didn't hear a command."); return; }

      let customerNames = [];
      let ownerId = null;
      try {
        ownerId = await requireCurrentUserId();
        if (!isMountedRef.current) return;
        const ledgerEntries = await database.get('ledger_entries').query(Q.where('owner_id', ownerId)).fetch();
        if (!isMountedRef.current) return;
        customerNames = [...new Set(ledgerEntries.map(entry => String(entry?.customerId || '').trim()).filter(Boolean))];
        customerNamesRef.current = customerNames;
      } catch (customerError) {
        console.warn('COUNTR POS customer lookup skipped:', customerError?.message || customerError);
        customerNames = Array.isArray(customerNamesRef.current) ? customerNamesRef.current : [];
      }

      if (!isMountedRef.current) return;

      const addToCartHandler = async command => {
        if (!isMountedRef.current) return;
        const productName = command.product || command.product_name;
        if (!productName) { safeSetAiStatus("Didn't catch which product. Try again."); return; }
        
        let match = null;
        if (command.resolved_inventory_id) {
          match = inventoryRef.current.find(item => item.id === command.resolved_inventory_id);
        }
        
        if (!match) {
          const normalizedProduct = String(productName).trim().toLowerCase();
          match = inventoryRef.current.find(item => { 
            const inventoryProduct = String(item?.productName || '').trim().toLowerCase(); 
            if (!inventoryProduct) return false; 
            return (inventoryProduct === normalizedProduct || inventoryProduct.includes(normalizedProduct) || normalizedProduct.includes(inventoryProduct)); 
          });
        }

        if (!match) { safeSetAiStatus(`Couldn't find "${productName}" in inventory`); return; }
        if (command.customer_name) safeSetCustomerName(String(command.customer_name));
        
        const numericQty = Number(command.quantity || command.qty);
        const safeQty = Number.isFinite(numericQty) && numericQty > 0 ? numericQty : 1;
        
        addToCart(match, safeQty, command.unit);
        safeSetAiStatus(`Added ${safeQty} ${command.unit || ''} ${match.productName}`);
      };

      const applyDiscountHandler = async command => {
        if (!isMountedRef.current) return;
        const safeDiscount = Number(command.discount_percent);
        if (Number.isFinite(safeDiscount) && safeDiscount >= 0 && safeDiscount <= 100) { safeSetDiscount(safeDiscount); safeSetAiStatus(`Applied ${safeDiscount}% discount`); } 
        else safeSetAiStatus('Invalid discount.');
      };

      const checkoutHandler = async command => {
        if (!isMountedRef.current) return;
        safeSetAiStatus('Ready to bill — choose Cash or Udhaar.');
      };

      const execution = await processPOSVoiceCommandPhase4D({
        text: safeText,
        inventory: inventoryRef.current,
        customerNames: customerNamesRef.current,
        ownerId,
        handlers: {
          'inventory.add': addToCartHandler,
          inventoryAdd: addToCartHandler,
          'sale.create': addToCartHandler,
          saleCreate: addToCartHandler,
          'pos.add_item': addToCartHandler,
          posAddItem: addToCartHandler,
          'pos.apply_discount': applyDiscountHandler,
          posApplyDiscount: applyDiscountHandler,
          'pos.checkout': checkoutHandler,
          posCheckout: checkoutHandler,
        },
      });

      if (!isMountedRef.current) return;

      if (execution && execution.status === 'REJECTED') {
        safeSetAiStatus(execution.reason || 'Command not recognized.');
      }

      const latencyMs = Date.now() - startTime;
      const intent = execution?.command?.intent || 'unknown';
      try { TelemetryService.logVoice(safeText, intent, intent, execution?.status === 'REJECTED' ? 'FAILED' : 'SUCCESS', latencyMs); } catch (telemetryError) {}

    } catch (error) {
      const latencyMs = Date.now() - startTime;
      console.error('COUNTR POS VOICE ERROR:', error);
      if (isMountedRef.current) safeSetAiStatus(error?.message || 'Could not process that command.');
      try { TelemetryService.logVoice(typeof text === 'string' ? text : '', 'unknown', 'unknown', 'FAILED', latencyMs, error?.message || 'Voice processing failed'); } catch {}
    }
  };

  const safeMicPress = async () => {
    if (isProcessingCommand.current) return;
    try {
      if (isListening) { await SpeechEngine.stop(); setIsListening(false); setAiStatus('Voice Add ready'); return; }
      setAiStatus('Listening... bolo'); setIsListening(true); await SpeechEngine.start();
    } catch (error) {
      setIsListening(false); setAiStatus('Microphone unavailable');
      TelemetryService.logError('pos_microphone', error?.message || 'Microphone start failed', error?.stack);
    }
  };

  const handleScan = async barcode => {
    try {
      if (typeof barcode !== 'string' || !barcode.trim()) throw new Error('Invalid barcode');
      const ownerId = await requireCurrentUserId(); const cleanBarcode = barcode.trim();
      const items = await database.get('inventory_items').query(Q.where('owner_id', ownerId), Q.where('barcode', cleanBarcode)).fetch();
      if (items.length > 0) addToCart(items[0]); else showAlert('Product Not Found', `Barcode ${cleanBarcode} inventory mein nahi mila.`);
    } catch (error) {
      TelemetryService.logError('barcode_lookup', error?.message || 'Barcode lookup failed', error?.stack); showAlert('Scan Error', 'Barcode process nahi ho saka.');
    }
  };

  const adjustQuantity = (itemId, change) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.id !== itemId) return item;
      const newQty = Number(item.qty) + change;
      if (newQty > item.maxQty) { Alert.alert('Stock Limit ⚠️', `Only ${item.maxQty} available.`); return item; }
      if (newQty > 0) return { ...item, qty: newQty, qtyText: newQty.toString() };
      return { ...item, qty: 0, qtyText: '0' };
    }));
  };

  const handleExactQuantity = (itemId, textValue) => {
    const cleanedText = textValue.replace(/[^0-9.]/g, '');
    setCart(prevCart => prevCart.map(item => {
      if (item.id !== itemId) return item;
      const numValue = parseFloat(cleanedText);
      if (numValue > item.maxQty) { Alert.alert('Stock Limit ⚠️', `Only ${item.maxQty} available.`); return { ...item, qtyText: item.maxQty.toString(), qty: item.maxQty }; }
      return { ...item, qtyText: cleanedText, qty: Number.isNaN(numValue) ? 0 : numValue };
    }));
  };

  const removeFromCart = (itemId) => setCart(prevCart => prevCart.filter(item => item.id !== itemId));

  const clearCart = () => {
    if (cart.length === 0) return;
    Alert.alert('Clear Sale?', 'Is sale ke saare items remove karein?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => setCart([]) }]);
  };

  const onBarcodeRead = event => {
    try {
      if (isScanningRef.current) return;
      const scannedBarcode = event?.nativeEvent?.codeStringValue; if (typeof scannedBarcode !== 'string') return;
      const cleanBarcode = scannedBarcode.trim(); if (!cleanBarcode || lastScannedRef.current === cleanBarcode) return;
      isScanningRef.current = true; lastScannedRef.current = cleanBarcode; setLastScanned(cleanBarcode); safeVibrate(100);
      setTimeout(() => { setIsScannerOpen(false); handleScan(cleanBarcode).finally(() => { setTimeout(() => { lastScannedRef.current = null; isScanningRef.current = false; setLastScanned(null); }, 1000); }); }, 150);
    } catch (error) {
      isScanningRef.current = false; lastScannedRef.current = null; setLastScanned(null); setIsScannerOpen(false);
      TelemetryService.logError('barcode_scan', error?.message || 'Barcode scan failed', error?.stack); showAlert('Scanner Error', 'Barcode read nahi ho saka.');
    }
  };

  const processCheckout = async paymentMethod => {
    if (isCheckoutProcessing.current) return;
    if (cart.length === 0) { showAlert('Cart Empty', 'Pehle sale mein product add karein.'); return; }
    isCheckoutProcessing.current = true; setCheckoutProcessing(true);

    try {
      const ownerId = await requireCurrentUserId(); let oldBalance = 0;
      if (paymentMethod === 'KHATA') {
        if (!customerName.trim()) { showAlert('Customer Required', 'Udhaar ke liye customer ka naam enter karein.'); isCheckoutProcessing.current = false; setCheckoutProcessing(false); return; }
        const allEntries = await database.get('ledger_entries').query(Q.where('owner_id', ownerId)).fetch();
        allEntries.filter(entry => String(entry.customerId || '').toLowerCase() === customerName.trim().toLowerCase()).forEach(entry => { oldBalance += entry.entryType === 'CREDIT' ? Number(entry.amount || 0) : -Number(entry.amount || 0); });
      }

      await database.write(async () => {
        const now = Date.now();
        await database.get('sales_transactions').create(sale => { sale.ownerId = ownerId; sale.totalAmount = total; sale.paymentType = paymentMethod; sale.isSynced = false; sale.createdAt = now; });
        for (const cartItem of cart) { const product = await database.get('inventory_items').find(cartItem.id); await product.update(productRecord => { productRecord.quantity -= cartItem.qty; productRecord.isSynced = false; productRecord.updatedAt = now; }); }
        if (paymentMethod === 'KHATA') { 
          await database.get('ledger_entries').create(entry => { 
            entry.ownerId = ownerId; 
            entry.customerId = customerName.trim(); 
            entry.amount = total; 
            entry.entryType = 'CREDIT'; 
            entry.isSynced = false; 
            entry.createdAt = now; 
            entry.customerPhone = customerPhone;
            
            // 👇 Store the exact items sold for easy matching
            entry.description = cart.map(i => `${i.qty}x ${i.name}`).join(', ');
          }); 
        }
      });

      if (customerPhone.length >= 10) sendWhatsAppReceipt(cart, total, customerPhone, paymentMethod, customerName, oldBalance, discount);
      TelemetryService.trackEvent('sale_created', 'pos', { amount: total, payment_type: paymentMethod, item_count: cart.length, has_discount: discount > 0 });
      showAlert('Sale Complete ✓', paymentMethod === 'KHATA' ? `₹${total} customer ke Khata mein add ho gaya.` : `₹${total} sale complete ho gayi.`);

      setCart([]); setTotal(0); setDiscount(0); setCustomerPhone(''); setCustomerName(''); onClose();
    } catch (error) {
      TelemetryService.logError('pos_checkout', error?.message || 'Checkout failed', error?.stack); showAlert('Checkout Failed', error?.message || 'Sale complete nahi ho saki.');
    } finally {
      isCheckoutProcessing.current = false; setCheckoutProcessing(false);
    }
  };

  const safeOpenScanner = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, { title: 'Camera Access', message: 'Countr needs camera access to scan product barcodes.', buttonNeutral: 'Ask Me Later', buttonNegative: 'Cancel', buttonPositive: 'OK' });
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) { showAlert('Camera Disabled', 'Barcode scan ke liye camera permission allow karein.'); return; }
      }
      isScanningRef.current = false; lastScannedRef.current = null; setLastScanned(null); setIsScannerOpen(true);
    } catch (error) {
      TelemetryService.logError('pos_camera_permission', error?.message || 'Camera permission failed', error?.stack); showAlert('Camera Error', 'Camera start nahi ho saka.');
    }
  };

  if (isScannerOpen) {
    return (
      <View style={styles.scannerScreen}>
        <Camera style={styles.camera} cameraType={CameraType.Back} scanBarcode onReadCode={onBarcodeRead} />
        <View pointerEvents="none" style={styles.scannerTopOverlay}><Text style={styles.scannerTitle}>Scan product</Text><Text style={styles.scannerSubtitle}>Barcode ko frame ke andar rakhein</Text></View>
        <View pointerEvents="none" style={styles.scanFrame}><View style={styles.frameCornerTL} /><View style={styles.frameCornerTR} /><View style={styles.frameCornerBL} /><View style={styles.frameCornerBR} /></View>
        {lastScanned && <View style={styles.scannedBadge}><Text style={styles.scannedBadgeText}>✓ Barcode detected</Text></View>}
        <TouchableOpacity style={[styles.cancelScanBtn, { bottom: Math.max(insets.bottom + 24, 40) }]} onPress={() => { setIsScannerOpen(false); isScanningRef.current = false; lastScannedRef.current = null; setLastScanned(null); }} activeOpacity={0.85}><Text style={styles.cancelScanText}>Close Scanner</Text></TouchableOpacity>
      </View>
    );
  }

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });
  const cartItemCount = cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 10) }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onClose} style={styles.backButton} activeOpacity={0.75}><Text style={styles.backIcon}>‹</Text></TouchableOpacity>
        <View style={styles.headerCenter}><Text style={styles.header}>New Sale</Text><Text style={styles.headerSubtitle}>{cartItemCount > 0 ? `${cartItemCount} item${cartItemCount === 1 ? '' : 's'} · Ready to bill` : 'Scan, search or speak'}</Text></View>
        <TouchableOpacity onPress={clearCart} disabled={cart.length === 0} style={[styles.headerClear, cart.length === 0 && styles.headerClearDisabled]} activeOpacity={0.75}><Text style={styles.headerClearText}>Clear</Text></TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 210, 230) }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.commandCard}>
          <View style={styles.commandHeader}><View><Text style={styles.commandEyebrow}>COUNTR VOICE</Text><Text style={styles.commandTitle}>Sale bolkar banao</Text><Text style={styles.commandSubtitle}>“2 Maggi add karo”</Text></View></View>
          <View style={styles.commandActions}>
            <TouchableOpacity style={[styles.voiceButton, isListening && styles.voiceButtonListening]} onPress={safeMicPress} disabled={checkoutProcessing} activeOpacity={0.85}>
              {isListening && <Animated.View pointerEvents="none" style={[styles.voicePulse, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />}
              <View style={styles.voiceButtonIcon}><View style={styles.micIcon}><View style={[styles.micHead, isListening && styles.micHeadListening]} /><View style={[styles.micArc, isListening && styles.micArcListening]} /><View style={[styles.micStem, isListening && styles.micStemListening]} /><View style={[styles.micBase, isListening && styles.micBaseListening]} /></View></View>
              <View style={styles.commandButtonText}><Text style={styles.voiceButtonTitle}>{isListening ? 'Listening...' : 'Voice Add'}</Text><Text style={styles.voiceButtonSub}>{isListening ? 'Boliye' : 'Product bolkar add'}</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.scanButton} onPress={safeOpenScanner} disabled={checkoutProcessing} activeOpacity={0.85}>
              <View style={styles.scanButtonIcon}><Text style={styles.scanButtonIconText}>▣</Text></View>
              <View style={styles.commandButtonText}><Text style={styles.scanButtonTitle}>Scan</Text><Text style={styles.scanButtonSub}>Barcode</Text></View>
            </TouchableOpacity>
          </View>
          <View style={styles.aiStatus}><View style={styles.aiStatusDot} /><Text style={styles.aiStatusText} numberOfLines={1}>{aiStatus}</Text>{discount > 0 && <View style={styles.discountBadge}><Text style={styles.discountText}>-{discount}%</Text></View>}</View>
        </View>

        <View style={styles.customerCard}>
          <View style={styles.customerHeader}><View><Text style={styles.sectionLabel}>RECEIPT / KHATA</Text><Text style={styles.customerTitle}>Customer details</Text></View><Text style={styles.optionalText}>Name for Udhaar</Text></View>
          <View style={styles.inputRow}>
            <View style={[styles.customerInputWrap, { marginRight: 7 }]}><Text style={styles.inputPrefix}>👤</Text><TextInput style={styles.customerInput} placeholder="Customer name" placeholderTextColor={COLORS.mutedLight} value={customerName} onChangeText={setCustomerName} editable={!checkoutProcessing} returnKeyType="next" /></View>
            <View style={styles.customerInputWrap}><Text style={styles.inputPrefix}>📱</Text><TextInput style={styles.customerInput} placeholder="WhatsApp number" placeholderTextColor={COLORS.mutedLight} keyboardType="phone-pad" maxLength={10} value={customerPhone} onChangeText={setCustomerPhone} editable={!checkoutProcessing} /></View>
          </View>
          <View style={styles.receiptHintRow}><View style={styles.receiptHintDot} /><Text style={styles.customerHint}>WhatsApp number se Cash ya Udhaar receipt share kar sakte hain.</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ADD PRODUCT</Text>
          <View style={styles.searchWrap}>
            <View style={styles.searchIconBox}><Text style={styles.searchIcon}>⌕</Text></View>
            <TextInput style={styles.searchInput} placeholder="Product name ya barcode" placeholderTextColor={COLORS.mutedLight} value={searchQuery} onChangeText={setSearchQuery} returnKeyType="search" autoCorrect={false} />
            {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.searchClear}>×</Text></TouchableOpacity>}
          </View>
        </View>

        <View style={styles.productGrid}>
          {filteredItems.length === 0 ? (
            <View style={styles.emptyProducts}>
              <View style={styles.emptyProductIcon}><Text>{availableItems.length === 0 ? '📦' : '⌕'}</Text></View>
              <Text style={styles.emptyProductsTitle}>{availableItems.length === 0 ? 'Inventory is empty' : 'Product not found'}</Text>
              <Text style={styles.emptyProductsSubtext}>{availableItems.length === 0 ? 'Add products from Inventory first.' : `No match for "${searchQuery}"`}</Text>
            </View>
          ) : (
            filteredItems.slice(0, 20).map(item => (
              <TouchableOpacity key={item.id} style={styles.productCard} onPress={() => addToCart(item)} activeOpacity={0.8}>
                <View style={styles.productTopRow}><View style={styles.productIcon}><Text style={styles.productIconText}>{String(item.productName || 'P').charAt(0).toUpperCase()}</Text></View><View style={styles.addCircle}><Text style={styles.addCircleText}>+</Text></View></View>
                <Text style={styles.productName} numberOfLines={2}>{item.productName}</Text>
                <View style={styles.productBottom}><Text style={styles.productPrice}>₹{item.sellingPrice}</Text><Text style={styles.stockText}>{item.quantity} left</Text></View>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.cartHeading}>
            <View><Text style={styles.sectionLabel}>CURRENT SALE</Text><Text style={styles.cartTitle}>{cart.length === 0 ? 'Nothing added yet' : `${cart.length} product${cart.length === 1 ? '' : 's'}`}</Text></View>
            {cart.length > 0 && <View style={styles.itemCountBadge}><Text style={styles.itemCountText}>{cartItemCount} items</Text></View>}
          </View>
          {cart.length === 0 ? (
            <View style={styles.emptyCart}>
              <View style={styles.emptyCartIcon}><Text>🛒</Text></View>
              <Text style={styles.emptyCartTitle}>Sale abhi empty hai</Text>
              <Text style={styles.emptyCartSubtext}>Product tap karein ya bolein: “2 biscuit add karo”</Text>
            </View>
          ) : (
            <View style={styles.cartList}>
              <FlatList data={cart} keyExtractor={item => item.id} scrollEnabled={false} renderItem={({ item }) => (
                <Animated.View style={[styles.cartItem, lastAddedName === item.name ? { transform: [{ scale: addBounce }] } : null]}>
                  <View style={styles.cartProductIcon}><Text style={styles.cartProductIconText}>{String(item.name || 'P').charAt(0).toUpperCase()}</Text></View>
                  <View style={styles.cartItemInfo}><Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text><Text style={styles.cartItemPrice}>₹{Number(item.price)} each</Text>{item.qty % 1 !== 0 && <Text style={styles.gramsText}>{item.qty * 1000} grams</Text>}</View>
                  <View style={styles.qtyControls}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQuantity(item.id, -1)}><Text style={styles.qtyBtnText}>−</Text></TouchableOpacity>
                    <TextInput style={styles.qtyInput} keyboardType="decimal-pad" value={item.qtyText} onChangeText={text => handleExactQuantity(item.id, text)} selectTextOnFocus />
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQuantity(item.id, 1)}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
                  </View>
                  <View style={styles.cartAmountWrap}>
                    <Text style={styles.cartAmount}>₹{Number(item.price) * Number(item.qty)}</Text>
                    <TouchableOpacity onPress={() => removeFromCart(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.removeBtnText}>×</Text></TouchableOpacity>
                  </View>
                </Animated.View>
              )} />
            </View>
          )}
        </View>

        {customerName.trim().length > 0 && (
          <View style={styles.khataHintCard}>
            <View style={styles.khataHintIcon}><Text>📖</Text></View>
            <View style={styles.khataHintTextWrap}><Text style={styles.khataHintTitle}>Udhaar dena hai?</Text><Text style={styles.khataHintText}>Neeche “Udhaar” choose karne par <Text style={styles.khataHintBold}>{customerName.trim()}</Text> ke Khata mein bill add hoga.</Text></View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 10, 18) }]}>
        <View style={styles.footerSummary}>
          <View><Text style={styles.footerLabel}>TOTAL</Text><Text style={styles.footerItems}>{cartItemCount} item{cartItemCount === 1 ? '' : 's'}{discount > 0 ? ` · ${discount}% discount` : ''}</Text></View>
          <Text style={styles.footerTotal}>₹{total}</Text>
        </View>
        <View style={styles.checkoutBtnRow}>
          <TouchableOpacity style={[styles.khataBtn, checkoutProcessing && styles.checkoutDisabled]} onPress={() => processCheckout('KHATA')} disabled={checkoutProcessing} activeOpacity={0.85}>
            <Text style={styles.khataBtnIcon}>📖</Text>
            <View><Text style={styles.khataBtnTitle}>Udhaar</Text><Text style={styles.khataBtnSub}>Khata mein</Text></View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cashBtn, checkoutProcessing && styles.checkoutDisabled]} onPress={() => processCheckout('CASH')} disabled={checkoutProcessing} activeOpacity={0.85}>
            <View><Text style={styles.cashBtnTitle}>{checkoutProcessing ? 'Processing...' : 'Cash / UPI'}</Text>{!checkoutProcessing && <Text style={styles.cashBtnSub}>Sale complete</Text>}</View>
            {!checkoutProcessing && <Text style={styles.cashArrow}>→</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 16 },
  scrollArea: { flex: 1 },
  scrollContent: { paddingTop: 4 },
  customerInputWrap: { flex: 1, minHeight: 46, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9 },
  inputPrefix: { fontSize: 13, marginRight: 6 },
  customerInput: { flex: 1, color: COLORS.ink, fontSize: 10, fontWeight: '600', paddingVertical: 8, paddingHorizontal: 0 },
  receiptHintRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  receiptHintDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: COLORS.green, marginRight: 6 },
  headerRow: { minHeight: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 9 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: COLORS.ink, fontSize: 30, lineHeight: 30, fontWeight: '300', marginTop: -2 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 10 },
  header: { color: COLORS.ink, fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  headerSubtitle: { color: COLORS.muted, fontSize: 8.5, fontWeight: '600', marginTop: 2 },
  headerClear: { minWidth: 55, height: 36, borderRadius: 11, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  headerClearDisabled: { opacity: 0.45 },
  headerClearText: { color: COLORS.red, fontSize: 9.5, fontWeight: '800' },
  commandCard: { backgroundColor: COLORS.white, borderRadius: 22, borderWidth: 1, borderColor: COLORS.greenBorder, padding: 15, marginBottom: 19, shadowColor: '#1D2A20', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.035, shadowRadius: 12, elevation: 2 },
  commandHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  commandEyebrow: { color: COLORS.green, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.4, marginBottom: 3 },
  commandTitle: { color: COLORS.ink, fontSize: 19, fontWeight: '900', letterSpacing: -0.5 },
  commandSubtitle: { color: COLORS.muted, fontSize: 9.5, marginTop: 3, fontStyle: 'italic' },
  commandSpark: { width: 43, height: 43, borderRadius: 14, backgroundColor: COLORS.greenSoft, alignItems: 'center', justifyContent: 'center' },
  commandSparkText: { color: COLORS.green, fontSize: 22, fontWeight: '900' },
  commandActions: { flexDirection: 'row', gap: 8 },
  voiceButton: { flex: 1, minHeight: 61, borderRadius: 16, backgroundColor: COLORS.brightGreen, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, overflow: 'hidden' },
  voiceButtonListening: { backgroundColor: '#F06A61' },
  voicePulse: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.white, left: -18, top: -19 },
  voiceButtonIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  micIcon: { width: 25, height: 29, alignItems: 'center', justifyContent: 'flex-start', position: 'relative' },
  micHead: { width: 10, height: 17, borderRadius: 6, backgroundColor: '#173018', position: 'absolute', top: 0 },
  micHeadListening: { backgroundColor: '#FFFFFF' },
  micArc: { position: 'absolute', width: 18, height: 17, borderWidth: 2, borderTopWidth: 0, borderColor: '#173018', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, bottom: 5 },
  micArcListening: { borderColor: '#FFFFFF' },
  micStem: { position: 'absolute', width: 2.5, height: 6, backgroundColor: '#173018', bottom: 1 },
  micStemListening: { backgroundColor: '#FFFFFF' },
  micBase: { position: 'absolute', width: 10, height: 2.5, borderRadius: 2, backgroundColor: '#173018', bottom: 0 },
  micBaseListening: { backgroundColor: '#FFFFFF' },
  commandButtonText: { flex: 1, minWidth: 0 },
  voiceButtonTitle: { color: '#173018', fontSize: 11.5, fontWeight: '900' },
  voiceButtonSub: { color: '#557132', fontSize: 8, fontWeight: '600', marginTop: 2 },
  scanButton: { flex: 0.62, minHeight: 61, borderRadius: 16, backgroundColor: COLORS.blueSoft, borderWidth: 1, borderColor: '#DDE7FB', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9 },
  scanButtonIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', marginRight: 7 },
  scanButtonIconText: { color: COLORS.blue, fontSize: 17, fontWeight: '900' },
  scanButtonTitle: { color: '#31599E', fontSize: 10.5, fontWeight: '900' },
  scanButtonSub: { color: '#7892C0', fontSize: 7.5, marginTop: 2 },
  aiStatus: { minHeight: 36, backgroundColor: COLORS.surface, borderRadius: 11, marginTop: 8, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center' },
  aiStatusDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: COLORS.green, marginRight: 7 },
  aiStatusText: { flex: 1, color: COLORS.muted, fontSize: 8.5, fontWeight: '600', fontStyle: 'italic' },
  discountBadge: { backgroundColor: COLORS.redSoft, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  discountText: { color: COLORS.red, fontSize: 8, fontWeight: '900' },
  section: { marginBottom: 19 },
  sectionLabel: { color: COLORS.green, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.35, marginBottom: 7 },
  searchWrap: { minHeight: 50, backgroundColor: COLORS.white, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9 },
  searchIconBox: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', marginRight: 7 },
  searchIcon: { color: COLORS.green, fontSize: 21, fontWeight: '800' },
  searchInput: { flex: 1, color: COLORS.ink, fontSize: 11, fontWeight: '600', paddingVertical: 8 },
  searchClear: { color: COLORS.muted, fontSize: 19, paddingHorizontal: 5 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 21 },
  productCard: { width: '48.5%', minHeight: 119, backgroundColor: COLORS.white, borderRadius: 17, borderWidth: 1, borderColor: COLORS.border, padding: 11, marginBottom: 8 },
  productTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  productIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: COLORS.greenSoft, alignItems: 'center', justifyContent: 'center' },
  productIconText: { color: COLORS.green, fontSize: 12, fontWeight: '900' },
  addCircle: { width: 27, height: 27, borderRadius: 9, backgroundColor: COLORS.brightGreen, alignItems: 'center', justifyContent: 'center' },
  addCircleText: { color: '#173018', fontSize: 18, lineHeight: 20, fontWeight: '600', marginTop: -1 },
  productName: { color: COLORS.ink, fontSize: 10.5, fontWeight: '800', lineHeight: 14, minHeight: 28 },
  productBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  productPrice: { color: COLORS.green, fontSize: 12, fontWeight: '900' },
  stockText: { color: COLORS.mutedLight, fontSize: 7.5, fontWeight: '600' },
  emptyProducts: { width: '100%', backgroundColor: COLORS.white, borderRadius: 17, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 28, alignItems: 'center' },
  emptyProductIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyProductsTitle: { color: COLORS.ink, fontSize: 11, fontWeight: '900' },
  emptyProductsSubtext: { color: COLORS.muted, fontSize: 8.5, marginTop: 4, textAlign: 'center' },
  cartHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 9 },
  cartTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '900', marginTop: 1 },
  itemCountBadge: { backgroundColor: COLORS.greenSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  itemCountText: { color: COLORS.green, fontSize: 7.5, fontWeight: '900' },
  cartList: { backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 11 },
  cartItem: { minHeight: 70, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#EEF1EE', paddingVertical: 9 },
  cartProductIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: COLORS.greenSoft, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  cartProductIconText: { color: COLORS.green, fontSize: 12, fontWeight: '900' },
  cartItemInfo: { flex: 1, minWidth: 0, paddingRight: 5 },
  cartItemName: { color: COLORS.ink, fontSize: 10, fontWeight: '800' },
  cartItemPrice: { color: COLORS.muted, fontSize: 7.5, marginTop: 3 },
  gramsText: { color: COLORS.green, fontSize: 7, fontWeight: '700', marginTop: 2 },
  qtyControls: { height: 33, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginRight: 7 },
  qtyBtn: { width: 27, height: 31, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  qtyInput: { width: 28, textAlign: 'center', color: COLORS.green, fontSize: 9.5, fontWeight: '900', paddingVertical: 0 },
  cartAmountWrap: { alignItems: 'flex-end', minWidth: 48 },
  cartAmount: { color: COLORS.ink, fontSize: 10.5, fontWeight: '900', marginBottom: 4 },
  removeBtnText: { color: '#A7B0AA', fontSize: 17, lineHeight: 17, fontWeight: '400' },
  emptyCart: { backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 28, alignItems: 'center' },
  emptyCartIcon: { width: 49, height: 49, borderRadius: 16, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyCartTitle: { color: COLORS.ink, fontSize: 11, fontWeight: '900' },
  emptyCartSubtext: { color: COLORS.muted, fontSize: 8.5, marginTop: 4, textAlign: 'center', paddingHorizontal: 20, lineHeight: 13 },
  customerCard: { backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 13, marginBottom: 12 },
  customerHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 },
  customerTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '900', marginTop: 1 },
  optionalText: { color: COLORS.mutedLight, fontSize: 7.5, fontWeight: '700', marginBottom: 2 },
  inputRow: { flexDirection: 'row' },
  inputField: { minHeight: 44, backgroundColor: COLORS.surface, borderRadius: 11, borderWidth: 1, borderColor: COLORS.border, color: COLORS.ink, fontSize: 9.5, fontWeight: '600', paddingHorizontal: 10 },
  customerHint: { color: COLORS.muted, fontSize: 7.5, lineHeight: 11, marginTop: 7 },
  khataHintCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.orangeSoft, borderRadius: 16, borderWidth: 1, borderColor: '#F4E2C9', padding: 11, marginBottom: 14 },
  khataHintIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  khataHintTextWrap: { flex: 1, minWidth: 0 },
  khataHintTitle: { color: '#8B5B24', fontSize: 9.5, fontWeight: '900' },
  khataHintText: { color: '#A27648', fontSize: 7.5, lineHeight: 11, marginTop: 2 },
  khataHintBold: { fontWeight: '900', color: '#8B5B24' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: 16, paddingTop: 10, shadowColor: '#152018', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 8 },
  footerSummary: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 9 },
  footerLabel: { color: COLORS.green, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.2 },
  footerItems: { color: COLORS.muted, fontSize: 8, marginTop: 2 },
  footerTotal: { color: COLORS.ink, fontSize: 26, fontWeight: '900', letterSpacing: -0.7 },
  checkoutBtnRow: { flexDirection: 'row', gap: 8 },
  khataBtn: { flex: 0.9, minHeight: 56, borderRadius: 16, backgroundColor: COLORS.redSoft, borderWidth: 1, borderColor: '#F1D4D0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  khataBtnIcon: { fontSize: 15, marginRight: 7 },
  khataBtnTitle: { color: COLORS.red, fontSize: 10.5, fontWeight: '900' },
  khataBtnSub: { color: '#B47872', fontSize: 7, marginTop: 2 },
  cashBtn: { flex: 1.25, minHeight: 56, borderRadius: 16, backgroundColor: COLORS.brightGreen, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15 },
  cashBtnTitle: { color: '#173018', fontSize: 11, fontWeight: '900' },
  cashBtnSub: { color: '#587735', fontSize: 7, marginTop: 2 },
  cashArrow: { color: '#173018', fontSize: 21, fontWeight: '300' },
  checkoutDisabled: { opacity: 0.5 },
  scannerScreen: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  scannerTopOverlay: { position: 'absolute', top: 48, left: 20, right: 20, alignItems: 'center' },
  scannerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  scannerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 5 },
  scanFrame: { position: 'absolute', top: '32%', left: '12%', right: '12%', height: '23%', borderRadius: 18 },
  frameCornerTL: { position: 'absolute', left: 0, top: 0, width: 38, height: 38, borderTopWidth: 4, borderLeftWidth: 4, borderColor: COLORS.brightGreen, borderTopLeftRadius: 15 },
  frameCornerTR: { position: 'absolute', right: 0, top: 0, width: 38, height: 38, borderTopWidth: 4, borderRightWidth: 4, borderColor: COLORS.brightGreen, borderTopRightRadius: 15 },
  frameCornerBL: { position: 'absolute', left: 0, bottom: 0, width: 38, height: 38, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: COLORS.brightGreen, borderBottomLeftRadius: 15 },
  frameCornerBR: { position: 'absolute', right: 0, bottom: 0, width: 38, height: 38, borderBottomWidth: 4, borderRightWidth: 4, borderColor: COLORS.brightGreen, borderBottomRightRadius: 15 },
  scannedBadge: { position: 'absolute', top: '58%', alignSelf: 'center', backgroundColor: COLORS.brightGreen, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  scannedBadgeText: { color: '#173018', fontSize: 10, fontWeight: '900' },
  cancelScanBtn: { position: 'absolute', left: 20, right: 20, minHeight: 53, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cancelScanText: { color: COLORS.ink, fontSize: 12, fontWeight: '900' },
});

export default POSScreen;