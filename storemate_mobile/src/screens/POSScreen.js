import React, { useState, useEffect } from 'react';
import { 
  SafeAreaView, View, Text, StyleSheet, FlatList, TouchableOpacity, 
  Alert, ScrollView, TextInput, Linking, Vibration 
} from 'react-native';
import { database } from '../core/database';
import { Q } from '@nozbe/watermelondb';
import { Camera, CameraType } from 'react-native-camera-kit';

const sendWhatsAppReceipt = (cart, totalAmount, customerPhone, paymentMethod, customerName, oldBalance = 0) => {
  // 1. Beautiful Header with Today's Date
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  let receiptText = `🏪 *STORE INVOICE* 🏪\n`;
  receiptText += `📅 Date: ${today}\n`;
  receiptText += `〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️\n\n`;
  
  // 2. Clean, Numbered Item List with Indented Math
  receiptText += `🛒 *ORDER DETAILS:*\n`;
  cart.forEach((item, index) => {
    receiptText += `${index + 1}. *${item.name}*\n`;
    receiptText += `    └ ${item.qty} x ₹${item.price} = ₹${item.price * item.qty}\n`;
  });
  
  receiptText += `\n〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  
  // 3. Smart Billing Section
  if (paymentMethod === 'KHATA') {
    receiptText += `🧾 *Current Bill:* ₹${totalAmount}\n`;
    receiptText += `👤 *Customer:* ${customerName.trim()}\n`;
    receiptText += `📖 *Payment:* Udhaar (Khata)\n\n`;

    if (oldBalance > 0) {
      receiptText += `📊 *Previous Dues:* ₹${oldBalance}\n`;
      receiptText += `🚨 *TOTAL BALANCE: ₹${totalAmount + oldBalance}*\n`;
    } else if (oldBalance < 0) {
      receiptText += `🟢 *Previous Advance:* ₹${Math.abs(oldBalance)}\n`;
      const newTotal = totalAmount + oldBalance;
      if (newTotal > 0) {
        receiptText += `🚨 *TOTAL BALANCE: ₹${newTotal}*\n`;
      } else {
        receiptText += `🟢 *Remaining Advance: ₹${Math.abs(newTotal)}*\n`;
      }
    } else {
      receiptText += `🚨 *TOTAL BALANCE: ₹${totalAmount}*\n`;
    }
  } else {
    receiptText += `🧾 *Total Paid: ₹${totalAmount}*\n`;
    receiptText += `💵 *Payment:* Cash / UPI\n`;
  }

  // 4. Professional Footer
  receiptText += `\n🙏 *Thank you for your visit!*`;

  // 5. Send to WhatsApp
  let formattedPhone = customerPhone.replace(/\D/g, ''); 
  if (formattedPhone.length === 10) {
    formattedPhone = `91${formattedPhone}`;
  }

  const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(receiptText)}`;

  Linking.openURL(url).catch(err => console.error('Could not open WhatsApp', err));
};

const POSScreen = ({ onClose }) => {
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [availableItems, setAvailableItems] = useState([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [lastScanned, setLastScanned] = useState(null);

  useEffect(() => {
    const fetchInventory = async () => {
      const items = await database.get('inventory_items').query().fetch();
      setAvailableItems(items);
    };
    fetchInventory();
  }, []);

  const filteredItems = availableItems.filter(item => 
    item.productName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (item.barcode && item.barcode.includes(searchQuery))
  );

  // 🚀 NEW: Centralized Add to Cart Logic
  const addToCart = (product) => {
    setCart(prevCart => {
      const existingItemIndex = prevCart.findIndex(item => item.id === product.id);
      const currentQtyInCart = existingItemIndex >= 0 ? prevCart[existingItemIndex].qty : 0;

      // Prevent adding more than what is in stock
      if (currentQtyInCart >= product.quantity) {
        Alert.alert("Stock Limit ⚠️", `You only have ${product.quantity} of ${product.productName} left!`);
        return prevCart;
      }

      let newCart;
      if (existingItemIndex >= 0) {
        newCart = [...prevCart];
        newCart[existingItemIndex].qty += 1;
        newCart[existingItemIndex].qtyText = newCart[existingItemIndex].qty.toString(); // Keep text in sync
      } else {
        newCart = [...prevCart, { 
          id: product.id, 
          name: product.productName, 
          price: product.sellingPrice,
          qty: 1,
          qtyText: "1", // 🚀 NEW: Store the text version for decimal typing
          maxQty: product.quantity 
        }];
      }
      
      calculateTotal(newCart);
      return newCart;
    });
    
    setSearchQuery(''); 
  };

  const handleScan = async (barcode) => {
    try {
      const item = await database.get('inventory_items').query(Q.where('barcode', barcode)).fetch();
      if (item.length > 0) {
        addToCart(item[0]);
      } else {
        Alert.alert("Not Found", `Barcode ${barcode} not found!`);
      }
    } catch (error) {
      Alert.alert("Database Error", error.message);
    }
  };

  // 🚀 FIXED: Quantity Adjustment Buttons [-] [+] now update the text box too!
  const adjustQuantity = (itemId, change) => {
    setCart(prevCart => {
      const newCart = prevCart.map(item => {
        if (item.id === itemId) {
          const newQty = item.qty + change;
          
          if (newQty > item.maxQty) {
            Alert.alert("Stock Limit", `Only ${item.maxQty} available in stock.`);
            return item;
          }
          
          if (newQty > 0) {
            // 🐛 THE BUG WAS HERE: We added `qtyText: newQty.toString()` so the screen updates!
            return { ...item, qty: newQty, qtyText: newQty.toString() }; 
          }
        }
        return item;
      });
      
      calculateTotal(newCart);
      return newCart;
    });
  };

  // 🚀 NEW: Handle manual typing of decimals (like 1.5 kg)
  const handleExactQuantity = (itemId, textValue) => {
    // Only allow numbers and decimal points
    const cleanedText = textValue.replace(/[^0-9.]/g, '');

    setCart(prevCart => {
      const newCart = prevCart.map(item => {
        if (item.id === itemId) {
          const numValue = parseFloat(cleanedText);
          
          // Prevent them from typing 50kg if they only have 10kg in stock
          if (numValue > item.maxQty) {
            Alert.alert("Stock Limit", `Only ${item.maxQty} available in stock.`);
            return { ...item, qtyText: item.maxQty.toString(), qty: item.maxQty };
          }

          return { 
            ...item, 
            qtyText: cleanedText, 
            qty: isNaN(numValue) ? 0 : numValue 
          };
        }
        return item;
      });
      
      calculateTotal(newCart);
      return newCart;
    });
  };

  const removeFromCart = (itemId, itemName) => {
    Alert.alert("Remove Item", `Remove ${itemName} from the cart?`, [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Remove", 
        style: "destructive",
        onPress: () => {
          setCart(prevCart => {
            const newCart = prevCart.filter(item => item.id !== itemId);
            calculateTotal(newCart);
            return newCart;
          });
        }
      }
    ]);
  };

  const calculateTotal = (currentCart) => {
    const newTotal = currentCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    setTotal(newTotal);
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

    let oldBalance = 0; // 🚀 NEW: Variable to hold the old balance

    if (paymentMethod === 'KHATA') {
      if (!customerName.trim()) return Alert.alert("Required", "Customer Name required for Udhaar.");
      
      // 🚀 NEW: Calculate the old balance by looking up previous Khata entries
      const allEntries = await database.get('ledger_entries').query().fetch();
      const customerEntries = allEntries.filter(
        e => e.customerId.toLowerCase() === customerName.trim().toLowerCase()
      );
      
      customerEntries.forEach(e => {
        if (e.entryType === 'CREDIT') oldBalance += e.amount;
        if (e.entryType === 'PAYMENT') oldBalance -= e.amount;
      });
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

      // 🚀 UPGRADED: We now pass the oldBalance into the WhatsApp function
      if (customerPhone.length >= 10) {
        sendWhatsAppReceipt(cart, total, customerPhone, paymentMethod, customerName, oldBalance);
      }

      Alert.alert("Checkout Complete", paymentMethod === 'KHATA' ? `₹${total} put on Khata.` : `₹${total} paid via Cash.`);

      setCart([]); setTotal(0); setCustomerPhone(''); setCustomerName('');
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
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cartItemText}>{item.name}</Text>
              <Text style={styles.cartItemPrice}>₹{item.price * item.qty}</Text>
              
              {/* 🚀 NEW: Smart Kirana Converter! */}
              {/* If the number has a decimal (like 0.25), automatically show the grams */}
              {item.qty % 1 !== 0 && (
                <Text style={{ color: '#0C9C4C', fontSize: 12, fontWeight: '600', marginTop: 2 }}>
                  ⚖️ {item.qty * 1000} grams
                </Text>
              )}
            </View>
            
            <View style={styles.qtyControls}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQuantity(item.id, -1)}>
                <Text style={styles.qtyBtnText}>-</Text>
              </TouchableOpacity>
              
              <TextInput
                style={styles.qtyInput}
                keyboardType="decimal-pad"
                value={item.qtyText}
                onChangeText={(text) => handleExactQuantity(item.id, text)}
                selectTextOnFocus={true} 
              />

              <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQuantity(item.id, 1)}>
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.removeBtn} onPress={() => removeFromCart(item.id, item.name)} activeOpacity={0.7}>
              <Text style={styles.removeBtnText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        )}
      />

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
  scannerGridWrapper: { maxHeight: 180, marginBottom: 20 }, 
  scannerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scanBtn: { backgroundColor: '#E7F7EE', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, width: '48%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  btnText: { color: '#0C9C4C', fontWeight: '700', fontSize: 13, flex: 1, marginRight: 5 },
  btnPriceText: { color: '#0C9C4C', fontSize: 13, fontWeight: '500', opacity: 0.8 },
  cartTitle: { color: '#1B1F23', fontSize: 17, fontWeight: '700', borderBottomWidth: 1, borderColor: '#EAECEC', paddingBottom: 10, marginBottom: 10 },
  
  cartItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#EAECEC' },
  cartItemText: { color: '#1B1F23', fontSize: 16, marginBottom: 4, fontWeight: '500' },
  cartItemPrice: { color: '#0C9C4C', fontSize: 15, fontWeight: '700' },
  
  // 🚀 NEW: Quantity Stepper Styles
  qtyControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAECEC', borderRadius: 8, marginRight: 15 },
  qtyBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  qtyBtnText: { fontSize: 18, fontWeight: 'bold', color: '#1B1F23' },
  // Replace qtyValue with this:
  qtyInput: { 
    fontSize: 16, 
    fontWeight: '700', 
    width: 45, 
    textAlign: 'center', 
    color: '#1D4ED8', // Make it blue so it looks tappable/editable
    paddingVertical: 0 // Prevents Android from making the text box too tall
  },

  removeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FDECEA', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { fontSize: 16 },
  footer: { marginTop: 'auto', borderTopWidth: 1, borderColor: '#EAECEC', paddingTop: 20 },
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