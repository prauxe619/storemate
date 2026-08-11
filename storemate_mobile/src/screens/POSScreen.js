import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  SafeAreaView, View, Text, StyleSheet, FlatList, TouchableOpacity, 
  Alert, ScrollView, TextInput, Linking, Vibration, Animated, AppState 
} from 'react-native';
import { database } from '../core/database';
import { Q } from '@nozbe/watermelondb';
import { Camera, CameraType } from 'react-native-camera-kit';
import { SpeechEngine } from '../core/speech/SpeechEngine';
import TelemetryService from '../services/TelemetryService';
import { BASE_URL } from '../config/api';

const sendWhatsAppReceipt = (cart, totalAmount, customerPhone, paymentMethod, customerName, oldBalance = 0, discount = 0) => {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  let receiptText = `🏪 *STORE INVOICE* 🏪\n📅 Date: ${today}\n〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️\n\n🛒 *ORDER DETAILS:*\n`;
  
  cart.forEach((item, index) => {
    receiptText += `${index + 1}. *${item.name}*\n    └ ${item.qty} x ₹${item.price} = ₹${item.price * item.qty}\n`;
  });
  
  receiptText += `\n〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  if (discount > 0) receiptText += `🏷️ *Discount Applied:* ${discount}%\n`;

  if (paymentMethod === 'KHATA') {
    receiptText += `🧾 *Current Bill:* ₹${totalAmount}\n👤 *Customer:* ${customerName.trim()}\n📖 *Payment:* Udhaar (Khata)\n\n`;
    if (oldBalance > 0) {
      receiptText += `📊 *Previous Dues:* ₹${oldBalance}\n🚨 *TOTAL BALANCE: ₹${totalAmount + oldBalance}*\n`;
    } else if (oldBalance < 0) {
      receiptText += `🟢 *Previous Advance:* ₹${Math.abs(oldBalance)}\n`;
      const newTotal = totalAmount + oldBalance;
      receiptText += newTotal > 0 ? `🚨 *TOTAL BALANCE: ₹${newTotal}*\n` : `🟢 *Remaining Advance: ₹${Math.abs(newTotal)}*\n`;
    } else {
      receiptText += `🚨 *TOTAL BALANCE: ₹${totalAmount}*\n`;
    }
  } else {
    receiptText += `🧾 *Total Paid: ₹${totalAmount}*\n💵 *Payment:* Cash / UPI\n`;
  }
  
  receiptText += `\n🙏 *Thank you for your visit!*\n\n`;

  // 🚀 PHASE 3: WhatsApp Virality Loop
  receiptText += `---\n`;
  receiptText += `Sent via StoreMate — The Free AI Operating System for Shops. Click here to digitize your store: https://storemate.in/app`;

  let formattedPhone = customerPhone.replace(/\D/g, ''); 
  if (formattedPhone.length === 10) formattedPhone = `91${formattedPhone}`;
  Linking.openURL(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(receiptText)}`).catch(err => console.error('Could not open WhatsApp', err));
};

const POSScreen = ({ onClose }) => {
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [availableItems, setAvailableItems] = useState([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/active/) && 
        (nextAppState === 'inactive' || nextAppState === 'background')
      ) {
        setIsScannerOpen(false); // Instantly kills the camera
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);
  
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastScanned, setLastScanned] = useState(null);

  const [isListening, setIsListening] = useState(false);
  const [aiStatus, setAiStatus] = useState("Tap mic to add items");
  
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const isProcessingCommand = useRef(false); 
  const inventoryRef = useRef([]);

  useEffect(() => {
    const fetchInventory = async () => {
      const items = await database.get('inventory_items').query().fetch();
      setAvailableItems(items);
      inventoryRef.current = items;
    };
    fetchInventory();
  }, []);

  useEffect(() => {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const discountAmount = subtotal * (discount / 100);
    setTotal(Math.round(subtotal - discountAmount));
  }, [cart, discount]);

  useEffect(() => {
    let loop;
    if (isListening) {
      pulseAnim.setValue(0);
      loop = Animated.loop(Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: true }));
      loop.start();
    } else {
      pulseAnim.setValue(0);
    }
    return () => loop && loop.stop();
  }, [isListening]);

  useEffect(() => {
    const partialSub = SpeechEngine.onPartialResult((text) => setAiStatus(`Listening: "${text}"`));
    
    const finalSub = SpeechEngine.onFinalResult(async (text) => {
      if (isProcessingCommand.current) return;
      isProcessingCommand.current = true;

      setIsListening(false);
      
      try {
        await processPOSVoiceCommand(text);
      } finally {
        isProcessingCommand.current = false;
      }
    });

    const errorSub = SpeechEngine.onError((code) => {
      setIsListening(false);
      isProcessingCommand.current = false;
      setAiStatus(`Mic failed (Code ${code})`);
    });

    return () => { 
      partialSub.remove();
      finalSub.remove();
      errorSub.remove();
    };
  }, []); 

  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return availableItems.filter(item => 
      item.productName.toLowerCase().includes(query) || 
      (item.barcode && item.barcode.includes(searchQuery))
    );
  }, [availableItems, searchQuery]);

  const addToCart = (product, explicitQty = null) => {
    setCart(prevCart => {
      const existingItemIndex = prevCart.findIndex(item => item.id === product.id);
      const currentQtyInCart = existingItemIndex >= 0 ? prevCart[existingItemIndex].qty : 0;
      const qtyToAdd = explicitQty || 1;

      if (currentQtyInCart + qtyToAdd > product.quantity) {
        Alert.alert("Stock Limit ⚠️", `You only have ${product.quantity} of ${product.productName} left!`);
        return prevCart;
      }

      let newCart;
      if (existingItemIndex >= 0) {
        newCart = [...prevCart];
        newCart[existingItemIndex].qty += qtyToAdd;
        newCart[existingItemIndex].qtyText = newCart[existingItemIndex].qty.toString();
      } else {
        newCart = [...prevCart, { 
          id: product.id, 
          name: product.productName, 
          price: product.sellingPrice,
          qty: qtyToAdd,
          qtyText: qtyToAdd.toString(), 
          maxQty: product.quantity 
        }];
      }
      return newCart;
    });
    setSearchQuery(''); 
  };

  const processPOSVoiceCommand = async (text) => {
    setAiStatus("Thinking...");
    const startTime = Date.now();
    try {
      const inventoryNames = inventoryRef.current.map(i => i.productName);

      const response = await fetch(`${BASE_URL}/api/v1/ai/parse-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, inventory_names: inventoryNames })
      });
      if (!response.ok) throw new Error("API Network Error");
      
      const aiData = await response.json();
      const latencyMs = Date.now() - startTime;
      const { intent, product, qty, discount_percent, customer_name } = aiData;
      TelemetryService.logVoice(
        text,
        aiData.intent,
        aiData.intent,
        'SUCCESS',
        latencyMs
      );

      // 🚀 Automatically populate customer name if mentioned (e.g. "Rahul ke khate mein")
      if (customer_name) {
        setCustomerName(customer_name);
      }

      // 🚀 Handle POS Cart intents natively
      if (intent === 'pos.add_item' || intent === 'sale.create' || intent === 'inventory.add') {
        if (!product) {
          setAiStatus("Didn't catch which product. Try again.");
        } else {
          // Find matching product using case-insensitive substring matching
          const match = inventoryRef.current.find(i => i.productName.toLowerCase().includes(product.toLowerCase()));
          if (match) {
            addToCart(match, qty || 1);
            setAiStatus(`Added ${qty || 1} ${match.productName}`);
          } else {
            setAiStatus(`Couldn't find "${product}" in inventory`);
          }
        }
      } else if (intent === 'pos.apply_discount') {
        setDiscount(discount_percent || 0);
        setAiStatus(`Applied ${discount_percent}% discount`);
      } else if (intent === 'pos.checkout') {
        setAiStatus("Ready to bill!");
      } else {
        setAiStatus("Command not recognized.");
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      TelemetryService.logVoice(text, 'unknown', 'unknown', 'FAILED', latencyMs, error.message);
    }
  };

  const safeMicPress = async () => {
    if (isListening) {
      await SpeechEngine.stop();
      setIsListening(false);
      setAiStatus("Tap mic to add items");
    } else {
      setAiStatus("Listening...");
      setIsListening(true);
      await SpeechEngine.start();
    }
  };

  const handleScan = async (barcode) => {
    const item = await database.get('inventory_items').query(Q.where('barcode', barcode)).fetch();
    if (item.length > 0) addToCart(item[0]);
    else Alert.alert("Not Found", `Barcode ${barcode} not found!`);
  };

  const adjustQuantity = (itemId, change) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.id === itemId) {
        const newQty = item.qty + change;
        if (newQty > item.maxQty) {
          Alert.alert("Stock Limit", `Only ${item.maxQty} available.`);
          return item;
        }
        if (newQty > 0) return { ...item, qty: newQty, qtyText: newQty.toString() }; 
      }
      return item;
    }));
  };

  const handleExactQuantity = (itemId, textValue) => {
    const cleanedText = textValue.replace(/[^0-9.]/g, '');
    setCart(prevCart => prevCart.map(item => {
      if (item.id === itemId) {
        const numValue = parseFloat(cleanedText);
        if (numValue > item.maxQty) {
          Alert.alert("Stock Limit", `Only ${item.maxQty} available.`);
          return { ...item, qtyText: item.maxQty.toString(), qty: item.maxQty };
        }
        return { ...item, qtyText: cleanedText, qty: isNaN(numValue) ? 0 : numValue };
      }
      return item;
    }));
  };

  const removeFromCart = (itemId, itemName) => {
    setCart(prevCart => prevCart.filter(item => item.id !== itemId));
  };

  const onBarcodeRead = (event) => {
    const scannedBarcode = event.nativeEvent.codeStringValue;
    if (scannedBarcode === lastScanned) return;
    setLastScanned(scannedBarcode);
    Vibration.vibrate(100); 
    setIsScannerOpen(false);
    handleScan(scannedBarcode);
    setTimeout(() => setLastScanned(null), 1000);
  };

  const processCheckout = async (paymentMethod) => {
    if (cart.length === 0) return Alert.alert("Empty Cart", "Add some items first!");

    let oldBalance = 0;
    if (paymentMethod === 'KHATA') {
      if (!customerName.trim()) return Alert.alert("Required", "Customer Name required for Udhaar.");
      const allEntries = await database.get('ledger_entries').query().fetch();
      allEntries.filter(e => e.customerId.toLowerCase() === customerName.trim().toLowerCase())
        .forEach(e => oldBalance += e.entryType === 'CREDIT' ? e.amount : -e.amount);
    }

    try {
      await database.write(async () => {
        const now = Date.now();
        await database.get('sales_transactions').create((t) => {
          t.totalAmount = total;
          t.paymentType = paymentMethod; 
          t.isSynced = false;
          t.createdAt = now;
        });

        for (const cartItem of cart) {
          const product = await database.get('inventory_items').find(cartItem.id);
          await product.update((p) => {
            p.quantity -= cartItem.qty; 
            p.isSynced = false;
            p.updatedAt = now;
          });
        }

        if (paymentMethod === 'KHATA') {
          await database.get('ledger_entries').create((entry) => {
            entry.customerId = customerName.trim();
            entry.amount = total;
            entry.entryType = 'CREDIT'; 
            entry.isSynced = false;
            entry.createdAt = now;
            entry.customerPhone = customerPhone; 
          });
        }
      });

      if (customerPhone.length >= 10) {
        sendWhatsAppReceipt(cart, total, customerPhone, paymentMethod, customerName, oldBalance, discount);
      }
      // 🚀 TRACK COMPLETED SALE EVENT
      TelemetryService.trackEvent('sale_created', 'pos', {
        amount: total,
        payment_type: paymentMethod,
        item_count: cart.length,
        has_discount: discount > 0
      });

      Alert.alert("Checkout Complete", paymentMethod === 'KHATA' ? `₹${total} put on Khata.` : `₹${total} paid via Cash.`);
      setCart([]); setTotal(0); setDiscount(0); setCustomerPhone(''); setCustomerName('');
      onClose();
    } catch (error) {
      Alert.alert("Checkout Failed", error.message);
    }
  };

  if (isScannerOpen) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <Camera style={{ flex: 1 }} cameraType={CameraType.Back} scanBarcode={true} onReadCode={onBarcodeRead} />
        <TouchableOpacity style={styles.cancelScanBtn} onPress={() => setIsScannerOpen(false)}>
          <Text style={styles.cancelScanText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>New Sale</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.liveCameraBtn} onPress={() => setIsScannerOpen(true)} activeOpacity={0.85}>
          <Text style={styles.liveCameraText}>📷 Scan Barcode</Text>
        </TouchableOpacity>
      </View>
      
      <TextInput style={styles.searchInput} placeholder="🔍 Search product name..." placeholderTextColor="#9CA3AF" value={searchQuery} onChangeText={setSearchQuery} />

      <View style={styles.scannerGridWrapper}>
        <ScrollView nestedScrollEnabled={true}>
          <View style={styles.scannerGrid}>
            {filteredItems.map((item) => (
              <TouchableOpacity key={item.id} style={styles.scanBtn} onPress={() => addToCart(item)} activeOpacity={0.8}>
                <Text style={styles.btnText} numberOfLines={1}>+ {item.productName}</Text>
                <Text style={styles.btnPriceText}>₹{item.sellingPrice}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <Text style={styles.cartTitle}>Current Cart</Text>

      <FlatList
        data={cart}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true} 
        initialNumToRender={15}      
        maxToRenderPerBatch={10}     
        windowSize={5}
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cartItemText}>{item.name}</Text>
              <Text style={styles.cartItemPrice}>₹{item.price * item.qty}</Text>
              {item.qty % 1 !== 0 && <Text style={styles.gramsText}>⚖️ {item.qty * 1000} grams</Text>}
            </View>
            
            <View style={styles.qtyControls}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQuantity(item.id, -1)}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>
              <TextInput style={styles.qtyInput} keyboardType="decimal-pad" value={item.qtyText} onChangeText={(text) => handleExactQuantity(item.id, text)} selectTextOnFocus={true} />
              <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQuantity(item.id, 1)}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.removeBtn} onPress={() => removeFromCart(item.id, item.name)} activeOpacity={0.7}><Text style={styles.removeBtnText}>✕</Text></TouchableOpacity>
          </View>
        )}
      />

      <View style={styles.voiceAgentRow}>
        <View style={styles.micWrap}>
          {isListening && <Animated.View pointerEvents="none" style={[styles.pulseRing, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />}
          <TouchableOpacity style={[styles.micButton, isListening && styles.micButtonActive]} onPress={safeMicPress} activeOpacity={0.85}>
            <Text style={styles.micIcon}>{isListening ? "⏹" : "🎙"}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.aiStatusText} numberOfLines={1}>{aiStatus}</Text>
        
        {discount > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discount}% Off</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.inputRow}>
          <TextInput style={[styles.inputField, { flex: 1, marginRight: 5 }]} placeholder="Customer Name" value={customerName} onChangeText={setCustomerName} />
          <TextInput style={[styles.inputField, { flex: 1, marginLeft: 5 }]} placeholder="WhatsApp No." keyboardType="numeric" maxLength={10} value={customerPhone} onChangeText={setCustomerPhone} />
        </View>
        
        <Text style={styles.total}>Total: <Text style={{ color: '#0C9C4C' }}>₹{total}</Text></Text>
        
        <View style={styles.checkoutBtnRow}>
          <TouchableOpacity style={styles.khataBtn} onPress={() => processCheckout('KHATA')}><Text style={styles.khataBtnText}>📖 Udhaar</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cashBtn} onPress={() => processCheckout('CASH')}><Text style={styles.cashBtnText}>💵 Cash</Text></TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F6', padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  header: { fontSize: 24, color: '#1B1F23', fontWeight: '800' },
  closeBtn: { padding: 10, paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#EAECEC' },
  closeBtnText: { color: '#1B1F23', fontWeight: '600' },
  actionRow: { marginBottom: 12 },
  liveCameraBtn: { backgroundColor: '#1D4ED8', padding: 16, borderRadius: 12, alignItems: 'center' },
  liveCameraText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelScanBtn: { position: 'absolute', bottom: 40, left: 20, right: 20, backgroundColor: '#E0433B', padding: 18, borderRadius: 12, alignItems: 'center' },
  cancelScanText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  searchInput: { backgroundColor: '#FFFFFF', color: '#1B1F23', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#EAECEC', fontSize: 15, marginBottom: 15 },
  scannerGridWrapper: { maxHeight: 180, marginBottom: 10 }, 
  scannerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scanBtn: { backgroundColor: '#E7F7EE', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, width: '48%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  btnText: { color: '#0C9C4C', fontWeight: '700', fontSize: 13, flex: 1, marginRight: 5 },
  btnPriceText: { color: '#0C9C4C', fontSize: 13, fontWeight: '500', opacity: 0.8 },
  cartTitle: { color: '#1B1F23', fontSize: 17, fontWeight: '700', borderBottomWidth: 1, borderColor: '#EAECEC', paddingBottom: 10, marginBottom: 10 },
  
  cartItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#EAECEC' },
  cartItemText: { color: '#1B1F23', fontSize: 16, marginBottom: 4, fontWeight: '600' },
  cartItemPrice: { color: '#0C9C4C', fontSize: 15, fontWeight: '700' },
  gramsText: { color: '#0C9C4C', fontSize: 12, fontWeight: '600', marginTop: 2 },
  
  qtyControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 8, marginRight: 15 },
  qtyBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  qtyBtnText: { fontSize: 18, fontWeight: 'bold', color: '#1B1F23' },
  qtyInput: { fontSize: 15, fontWeight: '700', width: 40, textAlign: 'center', color: '#1D4ED8', paddingVertical: 0 },

  removeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FDECEA', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { fontSize: 14, color: '#E0433B', fontWeight: '800' },

  voiceAgentRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#0C9C4C', marginTop: 10, marginBottom: 10 },
  micWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  pulseRing: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: '#E0433B' },
  micButton: { backgroundColor: '#0C9C4C', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  micButtonActive: { backgroundColor: '#E0433B' },
  micIcon: { fontSize: 18 },
  aiStatusText: { flex: 1, color: '#1B1F23', fontSize: 14, fontWeight: '600', fontStyle: 'italic' },
  discountBadge: { backgroundColor: '#E0433B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  discountText: { color: '#FFF', fontSize: 12, fontWeight: '800' },

  footer: { marginTop: 'auto', borderTopWidth: 1, borderColor: '#EAECEC', paddingTop: 15 },
  inputRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  inputField: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#EAECEC' },
  total: { fontSize: 26, color: '#1B1F23', fontWeight: '800', marginBottom: 15 },
  checkoutBtnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  khataBtn: { flex: 0.48, backgroundColor: '#FFFFFF', padding: 18, borderRadius: 14, borderWidth: 1.5, borderColor: '#E0433B', alignItems: 'center' },
  khataBtnText: { fontWeight: '700', color: '#E0433B', fontSize: 16 },
  cashBtn: { flex: 0.48, backgroundColor: '#0C9C4C', padding: 18, borderRadius: 14, alignItems: 'center' },
  cashBtnText: { fontWeight: '700', color: '#fff', fontSize: 16 }
});

export default POSScreen;