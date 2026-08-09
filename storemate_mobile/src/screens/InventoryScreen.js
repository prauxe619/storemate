import React, { useState, useEffect, useRef } from 'react';
import { 
  SafeAreaView, View, Text, StyleSheet, FlatList, 
  TouchableOpacity, TextInput, Alert, ActivityIndicator, 
  Modal, PermissionsAndroid, AppState 
} from 'react-native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '../core/database';
import { Camera, CameraType } from 'react-native-camera-kit';
import { uploadInvoice } from '../services/ocrService';
import { launchImageLibrary } from 'react-native-image-picker';
import { Q } from '@nozbe/watermelondb';
import RNFS from 'react-native-fs';

const InventoryScreen = ({ items, onClose }) => {
  const cameraRef = React.useRef(null);
  
  const [scanMode, setScanMode] = useState(null); 
  const appState = useRef(AppState.currentState);
  const [processingOCR, setProcessingOCR] = useState(false);
  
  const [scannedItems, setScannedItems] = useState([]);
  const [showReviewModal, setShowReviewModal] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/active/) && 
        (nextAppState === 'inactive' || nextAppState === 'background')
      ) {
        setScanMode(null); // Turns off the camera
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

// Manual Add States
  const [barcode, setBarcode] = useState('');
  const [productName, setProductName] = useState('');
  const [purchasePrice, setPurchasePrice] = useState(''); // 🚀 NEW: Cost
  const [sellingPrice, setSellingPrice] = useState('');   // 🚀 REPLACED 'price'
  const [quantity, setQuantity] = useState('');

  const lowStockCount = items.filter(i => i.quantity <= 5).length;
  // ✏️ Edit Modal States
  const [editingItem, setEditingItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editQuantity, setEditQuantity] = useState('');

  const handleAddItem = async () => {
    if (!productName || !sellingPrice || !quantity) {
      return Alert.alert("Missing Info", "Product name, sell price, and quantity are required.");
    }
    try {
      await database.write(async () => {
        await database.get('inventory_items').create(item => {
          item.barcode = barcode;
          item.productName = productName;
          item.purchasePrice = parseFloat(purchasePrice) || 0; // 🚀 NEW
          item.sellingPrice = parseFloat(sellingPrice);
          item.quantity = parseFloat(quantity); // 🚀 UPGRADED: Allows decimals like 1.5
          item.isSynced = false;
        });
      });
      // Clear form after saving
      setBarcode(''); setProductName(''); setPurchasePrice(''); setSellingPrice(''); setQuantity('');
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setEditName(item.productName);
    setEditPrice(item.sellingPrice.toString());
    setEditQuantity(item.quantity.toString());
    setShowEditModal(true);
  };

  const handleUpdateItem = async () => {
    if (!editName || !editPrice || !editQuantity) {
      return Alert.alert("Missing Info", "All fields are required.");
    }
    try {
      await database.write(async () => {
        await editingItem.update(item => {
          item.productName = editName;
          item.sellingPrice = parseFloat(editPrice);
          item.quantity = parseInt(editQuantity, 10);
          item.isSynced = false;
          item.updatedAt = Date.now();
        });
      });
      setShowEditModal(false);
    } catch (error) {
      Alert.alert("Update Error", error.message);
    }
  };

  const handleDeleteItem = () => {
    Alert.alert(
      "Delete Product",
      `Are you sure you want to delete ${editingItem.productName}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              await database.write(async () => {
                await editingItem.markAsDeleted();
              });
              setShowEditModal(false);
            } catch (error) {
              Alert.alert("Delete Error", error.message);
            }
          } 
        }
      ]
    );
  };

  

  const saveScannedItems = async () => {
    try {
      await database.write(async () => {
        const now = Date.now();
        const itemsCollection = database.get('inventory_items');

        for (const item of scannedItems) {
          const existingRecords = await itemsCollection.query(
            Q.where('product_name', item.productName)
          ).fetch();

          if (existingRecords.length > 0) {
            const existingItem = existingRecords[0];
            await existingItem.update((dbItem) => {
              dbItem.quantity += (Number(item.quantity) || 1);
              dbItem.purchasePrice = Number(item.purchasePrice) || dbItem.purchasePrice;
              dbItem.sellingPrice = Number(item.sellingPrice) || dbItem.sellingPrice;
              dbItem.isSynced = false;
              dbItem.updatedAt = now;
            });
          } else {
            await itemsCollection.create((dbItem) => {
              dbItem.productName = item.productName;
              dbItem.quantity = Number(item.quantity) || 1;
              dbItem.purchasePrice = Number(item.purchasePrice) || 0;
              dbItem.sellingPrice = Number(item.sellingPrice) || 0;
              dbItem.barcode = ""; 
              dbItem.unit = "pcs"; // 🌐 Phase 2 Polish: Smart Default[cite: 1]
              dbItem.isSynced = false;
              dbItem.updatedAt = now;
            });
          }
        }
      });
      
      Alert.alert("Success", "Stock updated successfully!");
      setShowReviewModal(false);
      setScannedItems([]);
    } catch (error) {
      console.error("DB Save Error:", error);
      Alert.alert("Database Error", "Could not save scanned items.");
    }
  };

  const updateScannedItem = (index, field, value) => {
    const updatedItems = [...scannedItems];
    updatedItems[index][field] = value;
    setScannedItems(updatedItems);
  };

  // 🌐 Phase 2 Polish: Destructive Action Guard (1-Tap Confirm)[cite: 1]
  const removeScannedItem = (indexToRemove, itemName) => {
    Alert.alert(
      "Remove Item",
      `Are you sure you want to remove ${itemName || 'this item'}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive", 
          onPress: () => {
            setScannedItems((prevItems) => prevItems.filter((_, index) => index !== indexToRemove));
          } 
        }
      ]
    );
  };

  const safeOpenScanner = async (mode) => {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: "Camera Access Required",
          message: "Storemate needs camera access to scan items and bills.",
          buttonNeutral: "Ask Me Later",
          buttonNegative: "Cancel",
          buttonPositive: "OK"
        }
      );
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        setScanMode(mode); 
      } else {
        Alert.alert("Camera Disabled", "Please enable camera permissions to scan.");
      }
    } catch (err) {
      Alert.alert("Hardware Error", "Camera could not be initialized.");
    }
  };

  const handleGalleryUpload = async () => {
    let result;
    try {
      result = await launchImageLibrary({ mediaType: 'photo', quality: 1 });
      if (result.didCancel || result.errorCode || !result.assets) return;

      const imageUri = result.assets[0].uri;
      setScanMode(null);
      setProcessingOCR(true);

      const ocrResult = await uploadInvoice(imageUri);
      
      if (!ocrResult) return; 
      
      if (ocrResult.extracted_data && ocrResult.extracted_data.length > 0) {
        setScannedItems(ocrResult.extracted_data);
        setShowReviewModal(true);
      } else {
        Alert.alert("No Items Found", "The AI couldn't read the items clearly.");
      }
    } catch (error) {
      Alert.alert("Upload Failed", error.message || "Could not open the gallery.");
    } finally {
      setProcessingOCR(false);
      // 🚀 Clean up the gallery duplicate
      if (result?.assets?.[0]?.uri) {
        RNFS.unlink(result.assets[0].uri).catch(() => {});
      }
    }
  };
  
  if (scanMode) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <Camera
          ref={cameraRef}
          style={{ flex: 1 }}
          cameraType={CameraType.Back}
          scanBarcode={scanMode === 'barcode'}
          onReadCode={(event) => {
            if (scanMode === 'barcode') {
              setBarcode(event.nativeEvent.codeStringValue);
              setScanMode(null);
            }
          }}
        />
        <View style={styles.scanOverlay} pointerEvents="none">
          <View style={styles.scanFrame} />
          <Text style={styles.scanHint}>
            {scanMode === 'barcode' ? 'Point at the barcode' : 'Fit the whole bill in frame'}
          </Text>
        </View>

        {scanMode === 'invoice' && (
          <View style={styles.cameraActionRow}>
            <TouchableOpacity
              style={styles.captureBtn}
             onPress={async () => {
                let capturedImageUri = null; // Store URI to delete later
                try {
                  const image = await cameraRef.current.capture();
                  capturedImageUri = image.uri;
                  setScanMode(null);
                  setProcessingOCR(true);
                  
                  const result = await uploadInvoice(image.uri);
                  
                  if (!result) return;
                  
                  if (result.extracted_data && result.extracted_data.length > 0) {
                    setScannedItems(result.extracted_data);
                    setShowReviewModal(true);
                  } else {
                    Alert.alert("No Items Found", "The AI couldn't read the items clearly.");
                  }
                } catch (e) {
                  Alert.alert("Scan Failed", "Could not read the invoice.");
                } finally {
                  setProcessingOCR(false);
                  // 🚀 Clean up the camera temporary file
                  if (capturedImageUri) {
                    RNFS.unlink(capturedImageUri).catch(() => {});
                  }
                }
              }}
            >
              <Text style={styles.captureBtnText}>📸 Capture Bill</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.galleryBtn} onPress={handleGalleryUpload}>
              <Text style={styles.btnText}>🖼️ Upload</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.cancelBtn} onPress={() => setScanMode(null)}>
          <Text style={styles.btnText}>✕ Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={processingOCR} transparent>
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0C9C4C" />
          <Text style={styles.loadingText}>Reading your bill...</Text>
        </View>
      </Modal>

      <View style={styles.headerRow}>
        <View>
          {/* 🌐 Phase 2 Polish: Hinglish Local Language[cite: 1] */}
          <Text style={styles.header}>Inventory</Text>
          <Text style={styles.headerHinglish}>Bhandar</Text>
          <Text style={styles.headerSub}>{items.length} products{lowStockCount > 0 ? ` · ${lowStockCount} low stock` : ''}</Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.scanRow}>
        <TouchableOpacity 
          style={[styles.bigScanBtn, { backgroundColor: '#EAF2FE' }]} 
          onPress={() => safeOpenScanner("barcode")}
          activeOpacity={0.8}
        >
          <Text style={styles.bigScanEmoji}>📦</Text>
          <Text style={[styles.bigScanBtnText, { color: '#1D4ED8' }]}>Scan Barcode</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.bigScanBtn, { backgroundColor: '#FFF6E5' }]} 
          onPress={() => safeOpenScanner("invoice")}
          activeOpacity={0.8}
        >
          <Text style={styles.bigScanEmoji}>🧾</Text>
          <Text style={[styles.bigScanBtnText, { color: '#B7791F' }]}>Scan Bill</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.addForm}>
        <Text style={styles.subHeader}>Or add manually <Text style={styles.subHeaderHinglish}>(Khud Dalein)</Text></Text>
        
        {/* Barcode & Name Row */}
        <View style={styles.row}>
          <TextInput 
            style={[styles.input, { flex: 1, marginRight: 10 }]} 
            placeholder="Barcode (Optional)" 
            placeholderTextColor="#9CA3AF" 
            value={barcode} 
            onChangeText={setBarcode} 
          />
          <TextInput 
            style={[styles.input, { flex: 1.5 }]} 
            placeholder="Product name" 
            placeholderTextColor="#9CA3AF" 
            value={productName} 
            onChangeText={setProductName} 
          />
        </View>

        {/* Prices & Qty Row */}
        <View style={styles.row}>
          <TextInput 
            style={[styles.input, { flex: 1, marginRight: 10 }]} 
            placeholder="Cost ₹" 
            placeholderTextColor="#9CA3AF" 
            keyboardType="numeric" 
            value={purchasePrice} 
            onChangeText={setPurchasePrice} 
          />
          <TextInput 
            style={[styles.input, { flex: 1, marginRight: 10 }]} 
            placeholder="Sell ₹" 
            placeholderTextColor="#9CA3AF" 
            keyboardType="numeric" 
            value={sellingPrice} 
            onChangeText={setSellingPrice} 
          />
          <TextInput 
            style={[styles.input, { flex: 1 }]} 
            placeholder="Qty (Kg/Pcs)" // 🚀 UPGRADED: Reminds them to use KGs
            placeholderTextColor="#9CA3AF" 
            keyboardType="decimal-pad" 
            value={quantity} 
            onChangeText={setQuantity} 
          />
        </View>

        {/* 🚀 NEW: Helper text to teach the shop owner how to use it */}
        <Text style={{ color: '#9CA3AF', fontSize: 11, fontStyle: 'italic', marginBottom: 15, marginLeft: 2 }}>
          💡 Tip: For loose items, enter total KGs. Name it "Rice (per kg)".
        </Text>

        <TouchableOpacity style={styles.addBtn} onPress={handleAddItem} activeOpacity={0.85}>
          <Text style={styles.btnText}>➕ Add to Stock</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subHeader}>Current Stock <Text style={styles.subHeaderHinglish}>(Abhi ka stock)</Text></Text>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true} 
        initialNumToRender={15}      
        maxToRenderPerBatch={10}     
        windowSize={5}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🗄️</Text>
            <Text style={styles.emptyText}>Your shelf is empty</Text>
            <Text style={styles.emptyTextHinglish}>Shelf khali hai</Text>
            <Text style={styles.emptySubtext}>Scan a barcode or a bill to get started</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.itemCard} 
            activeOpacity={0.7} 
            onPress={() => openEditModal(item)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.productName}</Text>
              {!!item.barcode && <Text style={styles.itemMeta}>#{item.barcode}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 12 }}>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.itemPrice}>₹{item.sellingPrice}</Text>
                <View style={[styles.qtyBadge, item.quantity <= 5 && styles.qtyBadgeLow]}>
                  <Text style={[styles.qtyBadgeText, item.quantity <= 5 && { color: '#E0433B' }]}>{item.quantity} left</Text>
                </View>
              </View>
              {/* Little edit icon to hint it's clickable */}
              <Text style={{ color: '#9CA3AF', fontSize: 18 }}>›</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <Modal visible={showReviewModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.header}>Review Invoice</Text>
            <TouchableOpacity onPress={() => setShowReviewModal(false)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Discard</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={scannedItems}
            keyExtractor={(item, index) => index.toString()}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true} 
            initialNumToRender={15}      
            maxToRenderPerBatch={10}     
            windowSize={5}
            renderItem={({ item, index }) => (
              <View style={styles.aiItemCard}>
                
                <View style={styles.aiItemHeader}>
                  <TextInput
                    style={styles.aiInputName}
                    value={item.productName}
                    onChangeText={(val) => updateScannedItem(index, 'productName', val)}
                    multiline={true}
                  />
                  <TouchableOpacity 
                    style={styles.aiDeleteBtn} 
                    onPress={() => removeScannedItem(index, item.productName)}
                  >
                    <Text style={styles.aiDeleteBtnText}>🗑️</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.aiRow}>
                  <View style={styles.aiInputWrapper}>
                    <Text style={styles.aiLabel}>Qty</Text>
                    <TextInput style={styles.aiInput} keyboardType="numeric" value={String(item.quantity)} onChangeText={(val) => updateScannedItem(index, 'quantity', val)} />
                  </View>
                  <View style={styles.aiInputWrapper}>
                    <Text style={styles.aiLabel}>Cost (₹)</Text>
                    <TextInput style={styles.aiInput} keyboardType="numeric" value={String(item.purchasePrice)} onChangeText={(val) => updateScannedItem(index, 'purchasePrice', val)} />
                  </View>
                  <View style={styles.aiInputWrapper}>
                    <Text style={styles.aiLabel}>Sell (₹)</Text>
                    <TextInput style={styles.aiInput} keyboardType="numeric" value={String(item.sellingPrice)} onChangeText={(val) => updateScannedItem(index, 'sellingPrice', val)} />
                  </View>
                </View>
              </View>
            )}
          />

          <TouchableOpacity style={styles.confirmSaveBtn} onPress={saveScannedItems} activeOpacity={0.85}>
            <Text style={styles.confirmSaveBtnText}>✅ Save {scannedItems.length} Items <Text style={{ fontWeight: '600', opacity: 0.85 }}>(Pakka Karein)</Text></Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* ✏️ Edit Item Modal */}
      <Modal visible={showEditModal} animationType="fade" transparent={true}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
              <Text style={styles.header}>Edit Product</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Text style={{ color: '#6B7280', fontSize: 24, marginTop: -5 }}>×</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.aiLabel}>Product Name</Text>
            <TextInput style={styles.input} value={editName} onChangeText={setEditName} />
            
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.aiLabel}>Price (₹)</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={editPrice} onChangeText={setEditPrice} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.aiLabel}>Quantity</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={editQuantity} onChangeText={setEditQuantity} />
              </View>
            </View>

            <TouchableOpacity style={styles.addBtn} onPress={handleUpdateItem}>
              <Text style={styles.btnText}>💾 Save Changes</Text>
            </TouchableOpacity>

            <TouchableOpacity style={{ padding: 15, alignItems: 'center', marginTop: 5 }} onPress={handleDeleteItem}>
              <Text style={{ color: '#E0433B', fontWeight: 'bold' }}>🗑️ Delete Product</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

// ---- Palette (matches HomeScreen / App.js) ----
// Background  #F5F7F6   Card #FFFFFF   Ink #1B1F23   Muted #6B7280
// Brand Green #0C9C4C   Alert Red #E0433B   Hairline #EAECEC
// Scan actions get their own soft tint chips (blue for barcode, amber for bill)
// so they read as distinct utilities rather than duplicate green buttons.

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F6', padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10, marginBottom: 20 },
  header: { fontSize: 24, color: '#1B1F23', fontWeight: '800' },
  headerHinglish: { color: '#9CA3AF', fontSize: 13, fontStyle: 'italic', marginTop: 1 },
  headerSub: { color: '#6B7280', fontSize: 13, marginTop: 6 },
  closeBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#EAECEC' },
  closeBtnText: { color: '#1B1F23', fontWeight: '600' },

  scanRow: { flexDirection: 'row', marginBottom: 18, gap: 10 },
  bigScanBtn: { flex: 1, borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  bigScanEmoji: { fontSize: 24, marginBottom: 6 },
  bigScanBtnText: { fontWeight: '700', fontSize: 13.5 },

  addForm: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 14, marginBottom: 20, borderWidth: 1, borderColor: '#EAECEC' },
  subHeader: { color: '#1B1F23', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  subHeaderHinglish: { color: '#9CA3AF', fontWeight: '400', fontStyle: 'italic', fontSize: 13 },
  barcodeTag: { color: '#0C9C4C', fontSize: 12, marginBottom: 8, fontWeight: '600' },
  row: { flexDirection: 'row', marginBottom: 10 },
  input: { backgroundColor: '#F5F7F6', color: '#1B1F23', padding: 13, borderRadius: 10, borderWidth: 1, borderColor: '#EAECEC', marginBottom: 10 },
  addBtn: { backgroundColor: '#0C9C4C', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: 'bold' },

  itemCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#EAECEC' },
  itemName: { color: '#1B1F23', fontSize: 16, fontWeight: '600' },
  itemMeta: { color: '#9CA3AF', fontSize: 12, marginTop: 3 },
  itemPrice: { color: '#0C9C4C', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  qtyBadge: { backgroundColor: '#E7F7EE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  qtyBadgeLow: { backgroundColor: '#FDECEA' },
  qtyBadgeText: { color: '#0C9C4C', fontSize: 11, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: '#1B1F23', fontSize: 16, fontWeight: '600' },
  emptyTextHinglish: { color: '#9CA3AF', fontSize: 13, fontStyle: 'italic', marginTop: 1 },
  emptySubtext: { color: '#6B7280', fontSize: 13, marginTop: 6 },

  // Camera/scan overlay stays dark — it's a full-screen camera viewfinder, not
  // part of the app chrome, so it keeps high-contrast white-on-black controls.
  scanOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 260, height: 350, borderWidth: 2, borderColor: '#0C9C4C', borderRadius: 16 },
  scanHint: { color: '#fff', marginTop: 16, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  cameraActionRow: { position: 'absolute', bottom: 110, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' },
  captureBtn: { flex: 2, backgroundColor: '#0C9C4C', padding: 18, borderRadius: 14, alignItems: 'center', marginRight: 10 },
  captureBtnText: { color: '#fff', fontWeight: 'bold' },
  galleryBtn: { flex: 1, backgroundColor: '#1D4ED8', padding: 18, borderRadius: 14, alignItems: 'center' },
  cancelBtn: { position: 'absolute', bottom: 40, left: 24, right: 24, backgroundColor: '#E0433B', padding: 16, borderRadius: 14, alignItems: 'center' },

  loadingOverlay: { flex: 1, backgroundColor: 'rgba(27,31,35,0.85)', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', marginTop: 14, fontSize: 15 },

  modalContainer: { flex: 1, backgroundColor: '#F5F7F6', padding: 20 },
  aiItemCard: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#EAECEC' },
  aiItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: '#EAECEC', paddingBottom: 8, marginBottom: 15 },
  aiInputName: { flex: 1, color: '#1B1F23', fontSize: 18, fontWeight: 'bold', marginRight: 10 },
  aiDeleteBtn: { backgroundColor: '#FDECEA', padding: 12, borderRadius: 8, alignSelf: 'center' },
  aiDeleteBtnText: { fontSize: 18 },
  aiRow: { flexDirection: 'row', justifyContent: 'space-between' },
  aiInputWrapper: { flex: 1, marginHorizontal: 5 },
  aiLabel: { color: '#6B7280', fontSize: 12, marginBottom: 5 },
  aiInput: { backgroundColor: '#F5F7F6', color: '#1B1F23', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#EAECEC', textAlign: 'center' },
  confirmSaveBtn: { backgroundColor: '#0C9C4C', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10, marginBottom: 20 },
  confirmSaveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

const enhance = withObservables([], () => ({
  items: database.get('inventory_items').query().observe(),
}));

export default enhance(InventoryScreen);