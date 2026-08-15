import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  Linking,
  Vibration,
  Animated,
  AppState,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { requireCurrentUserId } from '../core/auth/localUser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseVoiceCommand } from '../core/ai/VoiceCommandRouter';
import { database } from '../core/database';
import { Q } from '@nozbe/watermelondb';
import { Camera, CameraType } from 'react-native-camera-kit';
import { SpeechEngine } from '../core/speech/SpeechEngine';
import TelemetryService from '../services/TelemetryService';

/* =============================================================
 * HELPERS
 * ============================================================= */

const safeVibrate = (duration = 100) => {
  try {
    if (Vibration && typeof Vibration.vibrate === 'function') {
      Vibration.vibrate(duration);
    }
  } catch {
    // Vibration is optional. Never allow it to crash the POS.
  }
};

const sendWhatsAppReceipt = (
  cart,
  totalAmount,
  customerPhone,
  paymentMethod,
  customerName,
  oldBalance = 0,
  discount = 0
) => {
  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  let receiptText =
    `🏪 *STORE INVOICE* 🏪\n` +
    `📅 Date: ${today}\n` +
    `〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️\n\n` +
    `🛒 *ORDER DETAILS:*\n`;

  cart.forEach((item, index) => {
    receiptText +=
      `${index + 1}. *${item.name}*\n` +
      `    └ ${item.qty} x ₹${item.price} = ₹${item.price * item.qty}\n`;
  });

  receiptText += `\n〰️〰️〰️〰️〰️〰️〰️〰️〰️〰️\n`;

  if (discount > 0) {
    receiptText += `🏷️ *Discount Applied:* ${discount}%\n`;
  }

  if (paymentMethod === 'KHATA') {
    receiptText +=
      `🧾 *Current Bill:* ₹${totalAmount}\n` +
      `👤 *Customer:* ${customerName.trim()}\n` +
      `📖 *Payment:* Udhaar (Khata)\n\n`;

    if (oldBalance > 0) {
      receiptText +=
        `📊 *Previous Dues:* ₹${oldBalance}\n` +
        `🚨 *TOTAL BALANCE: ₹${totalAmount + oldBalance}*\n`;
    } else if (oldBalance < 0) {
      receiptText += `🟢 *Previous Advance:* ₹${Math.abs(oldBalance)}\n`;
      const newTotal = totalAmount + oldBalance;
      receiptText +=
        newTotal > 0
          ? `🚨 *TOTAL BALANCE: ₹${newTotal}*\n`
          : `🟢 *Remaining Advance: ₹${Math.abs(newTotal)}*\n`;
    } else {
      receiptText += `🚨 *TOTAL BALANCE: ₹${totalAmount}*\n`;
    }
  } else {
    receiptText += `🧾 *Total Paid: ₹${totalAmount}*\n` + `💵 *Payment:* Cash / UPI\n`;
  }

  receiptText += `\n🙏 *Thank you for your visit!*\n\n`;
  receiptText += `---\n`;
  receiptText +=
    `Sent via StoreMate — The Free AI Operating System for Shops. ` +
    `Click here to digitize your store: https://storemate.in/app`;

  let formattedPhone = customerPhone.replace(/\D/g, '');
  if (formattedPhone.length === 10) {
    formattedPhone = `91${formattedPhone}`;
  }

  Linking.openURL(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(receiptText)}`).catch(err =>
    console.error('Could not open WhatsApp', err)
  );
};

/* =============================================================
 * MAIN COMPONENT
 * ============================================================= */

const POSScreen = ({ onClose }) => {
  const insets = useSafeAreaInsets();

  // Cart
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [availableItems, setAvailableItems] = useState([]);

  // Scanner
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [lastScanned, setLastScanned] = useState(null);

  // React state is not synchronous — CameraKit can call onReadCode several
  // times before React re-renders. Refs give an immediate native lock.
  const lastScannedRef = useRef(null);
  const isScanningRef = useRef(false);

  // App state (camera safety)
  const appState = useRef(AppState.currentState);

  // Customer
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Voice
  const [isListening, setIsListening] = useState(false);
  const [aiStatus, setAiStatus] = useState('Tap the mic to add items by voice');
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const isProcessingCommand = useRef(false);
  const inventoryRef = useRef([]);

  // "Just added" bounce feedback for engagement
  const addBounce = useRef(new Animated.Value(1)).current;
  const [lastAddedName, setLastAddedName] = useState(null);

  // Checkout lock — prevents double taps from creating two sales.
  const isCheckoutProcessing = useRef(false);
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);

  /* ---------------------------------------------------------
   * APP STATE / CAMERA SAFETY
   * --------------------------------------------------------- */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/active/) &&
        (nextAppState === 'inactive' || nextAppState === 'background')
      ) {
        setIsScannerOpen(false);
        isScanningRef.current = false;
        lastScannedRef.current = null;
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, []);

  /* ---------------------------------------------------------
   * LOAD INVENTORY ISOLATED BY OWNER ID
   * --------------------------------------------------------- */
  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const ownerId = await requireCurrentUserId();
        const items = await database
          .get('inventory_items')
          .query(Q.where('owner_id', ownerId))
          .fetch();
        setAvailableItems(items);
        inventoryRef.current = items;
      } catch (error) {
        TelemetryService.logError(
          'pos_inventory_load',
          error?.message || 'Inventory load failed',
          error?.stack
        );
      }
    };
    fetchInventory();
  }, []);

  /* ---------------------------------------------------------
   * CALCULATE TOTAL
   * --------------------------------------------------------- */
  useEffect(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const discountAmount = subtotal * (discount / 100);
    setTotal(Math.round(subtotal - discountAmount));
  }, [cart, discount]);

  /* ---------------------------------------------------------
   * MIC PULSE ANIMATION
   * --------------------------------------------------------- */
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
  }, [isListening, pulseAnim]);

  /* ---------------------------------------------------------
   * POS SPEECH ENGINE
   * --------------------------------------------------------- */
  useEffect(() => {
    SpeechEngine.stop().catch(() => {});

    const partialSub = SpeechEngine.onPartialResult(text => {
      setAiStatus(`Listening: "${text}"`);
    });

    const finalSub = SpeechEngine.onFinalResult(async text => {
      if (isProcessingCommand.current) return;
      isProcessingCommand.current = true;
      setIsListening(false);
      try {
        await processPOSVoiceCommand(text);
      } finally {
        isProcessingCommand.current = false;
      }
    });

    const errorSub = SpeechEngine.onError(code => {
      setIsListening(false);
      isProcessingCommand.current = false;
      setAiStatus(`Mic failed (Code ${code})`);
    });

    return () => {
      partialSub.remove();
      finalSub.remove();
      errorSub.remove();
      SpeechEngine.stop().catch(() => {});
      isProcessingCommand.current = false;
    };
  }, []);

  /* ---------------------------------------------------------
   * FILTER ITEMS
   * --------------------------------------------------------- */
  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return availableItems.filter(
      item =>
        String(item.productName || '').toLowerCase().includes(query) ||
        (item.barcode && String(item.barcode).includes(searchQuery))
    );
  }, [availableItems, searchQuery]);

  /* ---------------------------------------------------------
   * ADD TO CART
   * --------------------------------------------------------- */
  const flashAdded = name => {
    setLastAddedName(name);
    addBounce.setValue(0.85);
    Animated.spring(addBounce, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
  };

  const addToCart = (product, explicitQty = null) => {
    if (!product || !product.id) return;

    const qtyToAdd = explicitQty || 1;
    if (!Number.isFinite(Number(qtyToAdd)) || Number(qtyToAdd) <= 0) return;

    setCart(prevCart => {
      const existingItemIndex = prevCart.findIndex(item => item.id === product.id);
      const currentQtyInCart = existingItemIndex >= 0 ? prevCart[existingItemIndex].qty : 0;

      if (currentQtyInCart + qtyToAdd > product.quantity) {
        Alert.alert('Stock Limit ⚠️', `You only have ${product.quantity} of ${product.productName} left!`);
        return prevCart;
      }

      let newCart;
      if (existingItemIndex >= 0) {
        newCart = [...prevCart];
        const newQty = newCart[existingItemIndex].qty + qtyToAdd;
        newCart[existingItemIndex] = {
          ...newCart[existingItemIndex],
          qty: newQty,
          qtyText: newQty.toString(),
        };
      } else {
        newCart = [
          ...prevCart,
          {
            id: product.id,
            name: product.productName,
            price: product.sellingPrice,
            qty: qtyToAdd,
            qtyText: qtyToAdd.toString(),
            maxQty: product.quantity,
          },
        ];
      }
      return newCart;
    });

    safeVibrate(30);
    flashAdded(product.productName);
    setSearchQuery('');
  };

  /* ---------------------------------------------------------
   * POS VOICE COMMAND
   * --------------------------------------------------------- */
  const processPOSVoiceCommand = async text => {
    setAiStatus('Thinking...');
    const startTime = Date.now();

    try {
      const safeText = typeof text === 'string'
        ? text.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 500)
        : '';

      if (!safeText) {
        setAiStatus("Didn't hear a command.");
        return;
      }

      const ownerId = await requireCurrentUserId();

      const inventoryNames = inventoryRef.current
        .map(i => String(i.productName || '').trim().slice(0, 150))
        .filter(Boolean)
        .slice(0, 1000);

      const customerNames = [
        ...new Set(
          (await database.get('ledger_entries').query(Q.where('owner_id', ownerId)).fetch())
            .map(entry => String(entry.customerId || '').trim())
            .filter(Boolean)
        ),
      ];

      const aiData = await parseVoiceCommand({
        text: safeText,
        inventoryNames,
        customerNames,
      });

      const latencyMs = Date.now() - startTime;

      TelemetryService.logVoice(
        safeText,
        aiData.intent || 'unknown',
        aiData.intent || 'unknown',
        'SUCCESS',
        latencyMs
      );

      const {
        intent,
        product,
        qty,
        discount_percent,
        customer_name,
      } = aiData;

      if (customer_name) {
        setCustomerName(customer_name);
      }

      if (intent === 'pos.add_item' || intent === 'sale.create') {
        if (!product) {
          setAiStatus("Didn't catch which product. Try again.");
          return;
        }

        const normalizedProduct = String(product).trim().toLowerCase();

        const match = inventoryRef.current.find(item =>
          String(item.productName || '').trim().toLowerCase().includes(normalizedProduct)
        );

        if (!match) {
          setAiStatus(`Couldn't find "${product}" in inventory`);
          return;
        }

        const safeQty = Number(qty) > 0 ? Number(qty) : 1;

        addToCart(match, safeQty);
        setAiStatus(`Added ${safeQty} ${match.productName}`);
        return;
      }

      if (intent === 'inventory.add') {
        setAiStatus('Stock-add commands are handled from the main screen.');
        return;
      }

      if (intent === 'pos.apply_discount') {
        const safeDiscount = Number(discount_percent);

        if (Number.isFinite(safeDiscount) && safeDiscount >= 0 && safeDiscount <= 100) {
          setDiscount(safeDiscount);
          setAiStatus(`Applied ${safeDiscount}% discount`);
        } else {
          setAiStatus('Invalid discount.');
        }

        return;
      }

      if (intent === 'pos.checkout') {
        setAiStatus('Ready to bill — choose Cash or Udhaar.');
        return;
      }

      if (intent === 'unknown' && product) {
        const normalizedProduct = String(product).trim().toLowerCase();

        const match = inventoryRef.current.find(item =>
          String(item.productName || '').trim().toLowerCase().includes(normalizedProduct)
        );

        if (!match) {
          setAiStatus(`"${product}" is not in inventory.`);
          return;
        }

        const safeQty = Number(qty) > 0 ? Number(qty) : 1;

        addToCart(match, safeQty);
        setAiStatus(`Added ${safeQty} ${match.productName}`);
        return;
      }

      setAiStatus('Command not recognized.');
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      setAiStatus(
        error?.name === 'AbortError'
          ? 'AI request timed out. Please try again.'
          : 'Could not process that. Please try again.'
      );

      TelemetryService.logVoice(
        text,
        'unknown',
        'unknown',
        'FAILED',
        latencyMs,
        error?.message || 'Voice command failed'
      );

      TelemetryService.logError(
        'pos_voice_ai',
        error?.message || 'Voice command failed',
        error?.stack
      );
    }
  };

  /* ---------------------------------------------------------
   * MICROPHONE
   * --------------------------------------------------------- */
  const safeMicPress = async () => {
    if (isProcessingCommand.current) return;

    try {
      if (isListening) {
        await SpeechEngine.stop();
        setIsListening(false);
        setAiStatus('Tap the mic to add items by voice');
        return;
      }

      setAiStatus('Listening...');
      setIsListening(true);
      await SpeechEngine.start();
    } catch (error) {
      setIsListening(false);
      setAiStatus('Microphone unavailable. Please try again.');
      TelemetryService.logError('pos_microphone', error?.message || 'Microphone start failed', error?.stack);
    }
  };

  /* ---------------------------------------------------------
   * BARCODE LOOKUP ISOLATED BY OWNER ID
   * --------------------------------------------------------- */
  const handleScan = async barcode => {
    try {
      if (typeof barcode !== 'string' || !barcode.trim()) throw new Error('Invalid barcode');

      const ownerId = await requireCurrentUserId();
      const cleanBarcode = barcode.trim();
      const item = await database
        .get('inventory_items')
        .query(
          Q.where('owner_id', ownerId),
          Q.where('barcode', cleanBarcode)
        )
        .fetch();

      if (item.length > 0) {
        addToCart(item[0]);
      } else {
        Alert.alert('Not Found', `Barcode ${cleanBarcode} not found!`);
      }
    } catch (error) {
      TelemetryService.logError('barcode_lookup', error?.message || 'Barcode lookup failed', error?.stack);
      Alert.alert('Scan Error', 'Could not process this barcode. Please try again.');
    }
  };

  /* ---------------------------------------------------------
   * QUANTITY +/-
   * --------------------------------------------------------- */
  const adjustQuantity = (itemId, change) => {
    setCart(prevCart =>
      prevCart.map(item => {
        if (item.id !== itemId) return item;

        const newQty = item.qty + change;
        if (newQty > item.maxQty) {
          Alert.alert('Stock Limit', `Only ${item.maxQty} available.`);
          return item;
        }
        if (newQty > 0) {
          return { ...item, qty: newQty, qtyText: newQty.toString() };
        }
        return { ...item, qty: 0, qtyText: '0' };
      })
    );
  };

  const handleExactQuantity = (itemId, textValue) => {
    const cleanedText = textValue.replace(/[^0-9.]/g, '');

    setCart(prevCart =>
      prevCart.map(item => {
        if (item.id !== itemId) return item;

        const numValue = parseFloat(cleanedText);
        if (numValue > item.maxQty) {
          Alert.alert('Stock Limit', `Only ${item.maxQty} available.`);
          return { ...item, qtyText: item.maxQty.toString(), qty: item.maxQty };
        }
        return { ...item, qtyText: cleanedText, qty: isNaN(numValue) ? 0 : numValue };
      })
    );
  };

  const removeFromCart = (itemId, itemName) => {
    setCart(prevCart => prevCart.filter(item => item.id !== itemId));
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    Alert.alert('Clear Cart', 'Remove all items from this sale?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => setCart([]) },
    ]);
  };

  /* ---------------------------------------------------------
   * BARCODE READ
   * --------------------------------------------------------- */
  const onBarcodeRead = event => {
    try {
      if (isScanningRef.current) return;

      const scannedBarcode = event?.nativeEvent?.codeStringValue;
      if (typeof scannedBarcode !== 'string') return;

      const cleanBarcode = scannedBarcode.trim();
      if (!cleanBarcode) return;
      if (lastScannedRef.current === cleanBarcode) return;

      isScanningRef.current = true;
      lastScannedRef.current = cleanBarcode;
      setLastScanned(cleanBarcode);
      safeVibrate(100);

      setTimeout(() => {
        setIsScannerOpen(false);
        handleScan(cleanBarcode).finally(() => {
          setTimeout(() => {
            lastScannedRef.current = null;
            isScanningRef.current = false;
            setLastScanned(null);
          }, 1000);
        });
      }, 150);
    } catch (error) {
      isScanningRef.current = false;
      lastScannedRef.current = null;
      setLastScanned(null);
      setIsScannerOpen(false);

      TelemetryService.logError('barcode_scan', error?.message || 'Barcode scan failed', error?.stack);
      Alert.alert('Scanner Error', 'Could not read this barcode. Please try again.');
    }
  };

  /* ---------------------------------------------------------
   * CHECKOUT WITH OWNER ISOLATION
   * --------------------------------------------------------- */
  const processCheckout = async paymentMethod => {
    if (isCheckoutProcessing.current) return;

    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Add some items first!');
      return;
    }

    isCheckoutProcessing.current = true;
    setCheckoutProcessing(true);

    try {
      const ownerId = await requireCurrentUserId();
      let oldBalance = 0;

      if (paymentMethod === 'KHATA') {
        if (!customerName.trim()) {
          Alert.alert('Required', 'Customer Name required for Udhaar.');
          isCheckoutProcessing.current = false;
          setCheckoutProcessing(false);
          return;
        }

        const allEntries = await database
          .get('ledger_entries')
          .query(Q.where('owner_id', ownerId))
          .fetch();
        allEntries
          .filter(e => String(e.customerId || '').toLowerCase() === customerName.trim().toLowerCase())
          .forEach(e => {
            oldBalance += e.entryType === 'CREDIT' ? e.amount : -e.amount;
          });
      }

      await database.write(async () => {
        const now = Date.now();

        await database.get('sales_transactions').create(sale => {
          sale.ownerId = ownerId;
          sale.totalAmount = total;
          sale.paymentType = paymentMethod;
          sale.isSynced = false;
          sale.createdAt = now;
        });

        for (const cartItem of cart) {
          const product = await database.get('inventory_items').find(cartItem.id);
          await product.update(p => {
            p.quantity -= cartItem.qty;
            p.isSynced = false;
            p.updatedAt = now;
          });
        }

        if (paymentMethod === 'KHATA') {
          await database.get('ledger_entries').create(entry => {
            entry.ownerId = ownerId;
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

      TelemetryService.trackEvent('sale_created', 'pos', {
        amount: total,
        payment_type: paymentMethod,
        item_count: cart.length,
        has_discount: discount > 0,
      });

      Alert.alert(
        'Checkout Complete',
        paymentMethod === 'KHATA' ? `₹${total} put on Khata.` : `₹${total} paid via Cash.`
      );

      setCart([]);
      setTotal(0);
      setDiscount(0);
      setCustomerPhone('');
      setCustomerName('');

      onClose();
    } catch (error) {
      TelemetryService.logError('pos_checkout', error?.message || 'Checkout failed', error?.stack);
      Alert.alert('Checkout Failed', error?.message || 'Could not complete this sale.');
    } finally {
      isCheckoutProcessing.current = false;
      setCheckoutProcessing(false);
    }
  };

  /* ---------------------------------------------------------
   * CAMERA PERMISSION / OPEN SCANNER
   * --------------------------------------------------------- */
  const safeOpenScanner = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
          title: 'Camera Access Required',
          message: 'StoreMate needs camera access to scan barcodes.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        });

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Camera Disabled', 'Please allow camera permission to scan barcodes.');
          return;
        }
      }

      isScanningRef.current = false;
      lastScannedRef.current = null;
      setLastScanned(null);
      setIsScannerOpen(true);
    } catch (error) {
      TelemetryService.logError('pos_camera_permission', error?.message || 'Camera permission failed', error?.stack);
      Alert.alert('Camera Error', 'Camera could not be initialized.');
    }
  };

  /* ---------------------------------------------------------
   * FULL-SCREEN SCANNER VIEW
   * --------------------------------------------------------- */
  if (isScannerOpen) {
    return (
      <View style={styles.scannerScreen}>
        <Camera style={styles.camera} cameraType={CameraType.Back} scanBarcode onReadCode={onBarcodeRead} />

        <View pointerEvents="none" style={styles.scanFrame} />
        <Text pointerEvents="none" style={styles.scanHint}>
          Point the camera at a barcode
        </Text>

        <TouchableOpacity
          style={[styles.cancelScanBtn, { bottom: Math.max(insets.bottom + 24, 40) }]}
          onPress={() => {
            setIsScannerOpen(false);
            isScanningRef.current = false;
            lastScannedRef.current = null;
            setLastScanned(null);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.cancelScanText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
  const cartItemCount = cart.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  /* ---------------------------------------------------------
   * MAIN POS SCREEN
   * --------------------------------------------------------- */
  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      {/* HEADER */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.header}>New Sale</Text>
          <Text style={styles.headerSubtitle}>
            {cartItemCount > 0 ? `${cartItemCount} item${cartItemCount === 1 ? '' : 's'} in cart` : 'Scan, search, or speak to begin'}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
          <Text style={styles.closeBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* QUICK ADD */}
        <View style={styles.quickAddRow}>
          <TouchableOpacity style={styles.liveCameraBtn} onPress={safeOpenScanner} activeOpacity={0.85}>
            <Text style={styles.liveCameraIcon}>📷</Text>
            <Text style={styles.liveCameraText}>Scan Barcode</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.micTile, isListening && styles.micTileActive]}
            onPress={safeMicPress}
            disabled={checkoutProcessing}
            activeOpacity={0.85}
          >
            {isListening && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.pulseRing,
                  { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                ]}
              />
            )}
            <Text style={styles.micTileIcon}>{isListening ? '⏹' : '🎙'}</Text>
            <Text style={styles.micTileText}>{isListening ? 'Stop' : 'Voice Add'}</Text>
          </TouchableOpacity>
        </View>

        {/* AI STATUS */}
        <View style={styles.aiStatusRow}>
          <Text style={styles.aiStatusText} numberOfLines={1}>
            {aiStatus}
          </Text>
          {discount > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{discount}% Off</Text>
            </View>
          )}
        </View>

        {/* SEARCH */}
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search products by name or barcode"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* PRODUCT GRID */}
        <View style={styles.productGrid}>
          {filteredItems.length === 0 ? (
            <View style={styles.emptyProducts}>
              <Text style={styles.emptyProductsText}>
                {availableItems.length === 0 ? 'No products in inventory yet.' : `No matches for "${searchQuery}"`}
              </Text>
            </View>
          ) : (
            filteredItems.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.productCard}
                onPress={() => addToCart(item)}
                activeOpacity={0.8}
              >
                <Text style={styles.productName} numberOfLines={1}>
                  {item.productName}
                </Text>
                <View style={styles.productCardFooter}>
                  <Text style={styles.productPrice}>₹{item.sellingPrice}</Text>
                  <View style={styles.productAddBadge}>
                    <Text style={styles.productAddBadgeText}>+ Add</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* CART */}
        <View style={styles.cartSection}>
          <View style={styles.cartHeaderRow}>
            <Text style={styles.cartTitle}>Current Cart</Text>
            {cart.length > 0 && (
              <TouchableOpacity onPress={clearCart} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.clearCartText}>Clear all</Text>
              </TouchableOpacity>
            )}
          </View>

          {cart.length === 0 ? (
            <View style={styles.emptyCart}>
              <Text style={styles.emptyCartIcon}>🛒</Text>
              <Text style={styles.emptyCartText}>Your cart is empty</Text>
              <Text style={styles.emptyCartSubtext}>Scan a barcode, tap a product, or say "add 2 sugar"</Text>
            </View>
          ) : (
            <FlatList
              data={cart}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <Animated.View
                  style={[
                    styles.cartItem,
                    lastAddedName === item.name ? { transform: [{ scale: addBounce }] } : null,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cartItemText} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.cartItemPrice}>₹{item.price * item.qty}</Text>
                    {item.qty % 1 !== 0 && (
                      <Text style={styles.gramsText}>⚖️ {item.qty * 1000} grams</Text>
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
                      onChangeText={text => handleExactQuantity(item.id, text)}
                      selectTextOnFocus
                    />

                    <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQuantity(item.id, 1)}>
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeFromCart(item.id, item.name)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}
            />
          )}
        </View>

        {/* CUSTOMER DETAILS */}
        <View style={styles.customerSection}>
          <Text style={styles.customerSectionTitle}>Customer details (optional)</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.inputField, { flex: 1, marginRight: 8 }]}
              placeholder="Customer Name"
              placeholderTextColor="#9CA3AF"
              value={customerName}
              onChangeText={setCustomerName}
              editable={!checkoutProcessing}
            />
            <TextInput
              style={[styles.inputField, { flex: 1 }]}
              placeholder="WhatsApp No."
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              maxLength={10}
              value={customerPhone}
              onChangeText={setCustomerPhone}
              editable={!checkoutProcessing}
            />
          </View>
          <Text style={styles.customerHint}>A WhatsApp receipt is sent automatically when a number is entered.</Text>
        </View>
      </ScrollView>

      {/* FOOTER */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.totalsRow}>
          <View>
            <Text style={styles.subtotalText}>Subtotal ₹{subtotal}</Text>
            {discount > 0 && <Text style={styles.discountLineText}>Discount -{discount}%</Text>}
          </View>
          <Text style={styles.total}>
            ₹<Text style={styles.totalAmount}>{total}</Text>
          </Text>
        </View>

        <View style={styles.checkoutBtnRow}>
          <TouchableOpacity
            style={[styles.khataBtn, checkoutProcessing && styles.checkoutDisabled]}
            onPress={() => processCheckout('KHATA')}
            disabled={checkoutProcessing}
            activeOpacity={0.85}
          >
            <Text style={styles.khataBtnText}>{checkoutProcessing ? 'Processing...' : '📖 Udhaar'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cashBtn, checkoutProcessing && styles.checkoutDisabled]}
            onPress={() => processCheckout('CASH')}
            disabled={checkoutProcessing}
            activeOpacity={0.85}
          >
            <Text style={styles.cashBtnText}>{checkoutProcessing ? 'Processing...' : '💵 Cash'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

/* =============================================================
 * STYLES
 * ============================================================= */

const GREEN = '#0C9C4C';
const RED = '#E0433B';
const BLUE = '#1D4ED8';
const INK = '#1B1F23';
const BORDER = '#EAECEC';
const MUTED = '#9CA3AF';
const SURFACE = '#FAFAFA';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 20 },
  scannerScreen: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },

  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: 12 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  header: { fontSize: 26, color: INK, fontWeight: '800' },
  headerSubtitle: { fontSize: 13, color: MUTED, marginTop: 2, fontWeight: '500' },
  closeBtn: {
    padding: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  closeBtnText: { color: INK, fontWeight: '600' },

  quickAddRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  liveCameraBtn: {
    flex: 1,
    backgroundColor: BLUE,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  liveCameraIcon: { fontSize: 18 },
  liveCameraText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  micTile: {
    width: 96,
    backgroundColor: GREEN,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  micTileActive: { backgroundColor: RED },
  micTileIcon: { fontSize: 20, color: '#fff' },
  micTileText: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 2 },
  pulseRing: {
    position: 'absolute',
    width: 96,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },

  aiStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  aiStatusText: { flex: 1, color: MUTED, fontSize: 13, fontWeight: '600', fontStyle: 'italic' },
  discountBadge: { backgroundColor: RED, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginLeft: 8 },
  discountText: { color: '#FFF', fontSize: 12, fontWeight: '800' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: INK, paddingVertical: 14, fontSize: 15 },
  searchClear: { color: MUTED, fontSize: 16, paddingHorizontal: 4 },

  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  emptyProducts: { width: '100%', paddingVertical: 24, alignItems: 'center' },
  emptyProductsText: { color: MUTED, fontSize: 14, fontWeight: '500' },

  productCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
  },
  productName: { color: INK, fontWeight: '700', fontSize: 14, marginBottom: 8 },
  productCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  productPrice: { color: GREEN, fontWeight: '700', fontSize: 14 },
  productAddBadge: { backgroundColor: '#E7F7EE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  productAddBadgeText: { color: GREEN, fontWeight: '800', fontSize: 11 },

  cartSection: { marginBottom: 20 },
  cartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: BORDER,
    paddingBottom: 10,
    marginBottom: 6,
  },
  cartTitle: { color: INK, fontSize: 17, fontWeight: '700' },
  clearCartText: { color: RED, fontSize: 13, fontWeight: '700' },

  emptyCart: { alignItems: 'center', paddingVertical: 28 },
  emptyCartIcon: { fontSize: 32, marginBottom: 8 },
  emptyCartText: { color: INK, fontSize: 15, fontWeight: '700' },
  emptyCartSubtext: { color: MUTED, fontSize: 12, marginTop: 4, textAlign: 'center' },

  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  cartItemText: { color: INK, fontSize: 16, marginBottom: 4, fontWeight: '600' },
  cartItemPrice: { color: GREEN, fontSize: 15, fontWeight: '700' },
  gramsText: { color: GREEN, fontSize: 12, fontWeight: '600', marginTop: 2 },

  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 8,
    marginRight: 12,
  },
  qtyBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  qtyBtnText: { fontSize: 18, fontWeight: 'bold', color: INK },
  qtyInput: { fontSize: 15, fontWeight: '700', width: 40, textAlign: 'center', color: BLUE, paddingVertical: 0 },

  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FDECEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { fontSize: 14, color: RED, fontWeight: '800' },

  customerSection: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  customerSectionTitle: { color: INK, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  inputRow: { flexDirection: 'row' },
  inputField: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    color: INK,
    fontSize: 14,
  },
  customerHint: { color: MUTED, fontSize: 11, marginTop: 8 },

  footer: {
    borderTopWidth: 1,
    borderColor: BORDER,
    paddingTop: 14,
    backgroundColor: '#FFFFFF',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  subtotalText: { color: MUTED, fontSize: 13, fontWeight: '600' },
  discountLineText: { color: RED, fontSize: 12, fontWeight: '700', marginTop: 2 },
  total: { fontSize: 20, color: MUTED, fontWeight: '600' },
  totalAmount: { fontSize: 28, color: INK, fontWeight: '800' },

  checkoutBtnRow: { flexDirection: 'row', gap: 10 },
  khataBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: RED,
    alignItems: 'center',
  },
  khataBtnText: { fontWeight: '700', color: RED, fontSize: 16 },
  cashBtn: { flex: 1, backgroundColor: GREEN, padding: 18, borderRadius: 14, alignItems: 'center' },
  cashBtnText: { fontWeight: '700', color: '#fff', fontSize: 16 },
  checkoutDisabled: { opacity: 0.55 },

  scanFrame: {
    position: 'absolute',
    top: '30%',
    left: '12%',
    right: '12%',
    height: '25%',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderRadius: 16,
  },
  scanHint: {
    position: 'absolute',
    top: '58%',
    alignSelf: 'center',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelScanBtn: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: RED,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelScanText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});

export default POSScreen;