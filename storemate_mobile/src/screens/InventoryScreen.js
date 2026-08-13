import React, {
  useState,
  useEffect,
  useRef,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  PermissionsAndroid,
  AppState,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';

import {
  withObservables,
} from '@nozbe/watermelondb/react';

import { database } from '../core/database';

import {
  Camera,
  CameraType,
} from 'react-native-camera-kit';

import {
  uploadInvoice,
} from '../services/ocrService';

import {
  launchImageLibrary,
} from 'react-native-image-picker';

import { Q } from '@nozbe/watermelondb';

import TelemetryService from '../services/TelemetryService';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import RNFS from 'react-native-fs';


const InventoryScreen = ({
  items,
  onClose,
}) => {

  /*
   * =========================================================
   * SAFE AREA + RESPONSIVE SCREEN INFORMATION
   * =========================================================
   *
   * insets.top:
   *   Status bar / notch / camera cutout
   *
   * insets.bottom:
   *   Android navigation bar / gesture area
   *
   * IMPORTANT:
   * Camera mode does NOT use these as padding
   * on the camera itself. The camera remains full-screen.
   */
  const insets =
    useSafeAreaInsets();

  const {
    width: windowWidth,
    height: windowHeight,
  } = useWindowDimensions();

  /*
   * Responsive horizontal padding.
   *
   * Small phones:
   *   14
   *
   * Normal phones:
   *   20
   *
   * Large phones / tablets:
   *   28
   */
  const screenPadding =
    windowWidth < 360
      ? 14
      : windowWidth < 600
      ? 20
      : 28;

  /*
   * Prevent edit dialog from becoming
   * excessively wide on tablets.
   */
  const editModalWidth =
    Math.min(
      windowWidth - 32,
      520
    );

  /*
   * Camera reference.
   */
  const cameraRef =
    useRef(null);

  /*
   * =========================================================
   * SCANNER STATE
   * =========================================================
   */

  const [
    scanMode,
    setScanMode,
  ] = useState(null);

  const appState =
    useRef(
      AppState.currentState
    );

  const [
    processingOCR,
    setProcessingOCR,
  ] = useState(false);

  /*
   * =========================================================
   * OCR REVIEW STATE
   * =========================================================
   */

  const [
    scannedItems,
    setScannedItems,
  ] = useState([]);

  const [
    showReviewModal,
    setShowReviewModal,
  ] = useState(false);

  /*
   * =========================================================
   * APP STATE
   * =========================================================
   */

  useEffect(() => {
    const subscription =
      AppState.addEventListener(
        'change',
        nextAppState => {

          if (
            appState.current.match(
              /active/
            ) &&
            (
              nextAppState ===
                'inactive' ||
              nextAppState ===
                'background'
            )
          ) {
            /*
             * Never leave the camera
             * running when app goes
             * into background.
             */
            setScanMode(null);
          }

          appState.current =
            nextAppState;
        }
      );

    return () => {
      subscription.remove();
    };
  }, []);


  /*
   * =========================================================
   * MANUAL ADD STATES
   * =========================================================
   */

  const [
    barcode,
    setBarcode,
  ] = useState('');

  const [
    productName,
    setProductName,
  ] = useState('');

  const [
    purchasePrice,
    setPurchasePrice,
  ] = useState('');

  const [
    sellingPrice,
    setSellingPrice,
  ] = useState('');

  const [
    quantity,
    setQuantity,
  ] = useState('');


  /*
   * =========================================================
   * EDIT MODAL STATES
   * =========================================================
   */

  const lowStockCount =
    items.filter(
      item =>
        item.quantity <= 5
    ).length;

  const [
    editingItem,
    setEditingItem,
  ] = useState(null);

  const [
    showEditModal,
    setShowEditModal,
  ] = useState(false);

  const [
    editName,
    setEditName,
  ] = useState('');

  const [
    editPrice,
    setEditPrice,
  ] = useState('');

  const [
    editQuantity,
    setEditQuantity,
  ] = useState('');


  /*
   * =========================================================
   * ADD ITEM
   * =========================================================
   */

  const handleAddItem =
    async () => {

      if (
        !productName ||
        !sellingPrice ||
        !quantity
      ) {
        return Alert.alert(
          'Missing Info',
          'Product name, sell price, and quantity are required.'
        );
      }

      try {

        await database.write(
          async () => {

            await database
              .get(
                'inventory_items'
              )
              .create(item => {

                item.barcode =
                  barcode;

                item.productName =
                  productName;

                item.purchasePrice =
                  parseFloat(
                    purchasePrice
                  ) || 0;

                item.sellingPrice =
                  parseFloat(
                    sellingPrice
                  );

                item.quantity =
                  parseFloat(
                    quantity
                  );

                item.isSynced =
                  false;

                TelemetryService.trackEvent(
                  'product_added',
                  'inventory',
                  {
                    product_name:
                      productName,

                    selling_price:
                      parseFloat(
                        sellingPrice
                      ),

                    quantity:
                      parseFloat(
                        quantity
                      ),
                  }
                );
              });
          }
        );

        /*
         * Clear form after saving.
         */
        setBarcode('');
        setProductName('');
        setPurchasePrice('');
        setSellingPrice('');
        setQuantity('');

      } catch (error) {

        Alert.alert(
          'Error',
          error.message
        );
      }
    };


  /*
   * =========================================================
   * OPEN EDIT
   * =========================================================
   */

  const openEditModal =
    item => {

      setEditingItem(
        item
      );

      setEditName(
        item.productName
      );

      setEditPrice(
        item.sellingPrice.toString()
      );

      setEditQuantity(
        item.quantity.toString()
      );

      setShowEditModal(
        true
      );
    };


  /*
   * =========================================================
   * UPDATE ITEM
   * =========================================================
   */

  const handleUpdateItem =
    async () => {

      if (
        !editName ||
        !editPrice ||
        !editQuantity
      ) {
        return Alert.alert(
          'Missing Info',
          'All fields are required.'
        );
      }

      try {

        await database.write(
          async () => {

            await editingItem.update(
              item => {

                item.productName =
                  editName;

                item.sellingPrice =
                  parseFloat(
                    editPrice
                  );

                /*
                 * Preserve decimal quantities.
                 *
                 * This is important for:
                 * Kg, litres, meters, etc.
                 */
                item.quantity =
                  parseFloat(
                    editQuantity
                  );

                item.isSynced =
                  false;

                item.updatedAt =
                  Date.now();
              }
            );
          }
        );

        setShowEditModal(
          false
        );

      } catch (error) {

        Alert.alert(
          'Update Error',
          error.message
        );
      }
    };


  /*
   * =========================================================
   * DELETE ITEM
   * =========================================================
   */

  const handleDeleteItem =
    () => {

      if (!editingItem) {
        return;
      }

      Alert.alert(
        'Delete Product',

        `Are you sure you want to delete ${editingItem.productName}?`,

        [
          {
            text: 'Cancel',
            style: 'cancel',
          },

          {
            text: 'Delete',
            style: 'destructive',

            onPress:
              async () => {

                try {

                  await database.write(
                    async () => {

                      await editingItem.markAsDeleted();

                    }
                  );

                  setShowEditModal(
                    false
                  );

                  setEditingItem(
                    null
                  );

                } catch (error) {

                  Alert.alert(
                    'Delete Error',
                    error.message
                  );
                }
              },
          },
        ]
      );
    };


  /*
   * =========================================================
   * SAVE SCANNED ITEMS
   * =========================================================
   */

  const saveScannedItems =
    async () => {

      try {

        await database.write(
          async () => {

            const now =
              Date.now();

            const itemsCollection =
              database.get(
                'inventory_items'
              );

            for (
              const item of
                scannedItems
            ) {

              const existingRecords =
                await itemsCollection
                  .query(
                    Q.where(
                      'product_name',
                      item.productName
                    )
                  )
                  .fetch();

              if (
                existingRecords.length >
                0
              ) {

                const existingItem =
                  existingRecords[0];

                await existingItem.update(
                  dbItem => {

                    dbItem.quantity +=
                      Number(
                        item.quantity
                      ) || 1;

                    dbItem.purchasePrice =
                      Number(
                        item.purchasePrice
                      ) ||
                      dbItem.purchasePrice;

                    dbItem.sellingPrice =
                      Number(
                        item.sellingPrice
                      ) ||
                      dbItem.sellingPrice;

                    dbItem.isSynced =
                      false;

                    dbItem.updatedAt =
                      now;
                  }
                );

              } else {

                await itemsCollection.create(
                  dbItem => {

                    dbItem.productName =
                      item.productName;

                    dbItem.quantity =
                      Number(
                        item.quantity
                      ) || 1;

                    dbItem.purchasePrice =
                      Number(
                        item.purchasePrice
                      ) || 0;

                    dbItem.sellingPrice =
                      Number(
                        item.sellingPrice
                      ) || 0;

                    dbItem.barcode =
                      '';

                    dbItem.unit =
                      'pcs';

                    dbItem.isSynced =
                      false;

                    dbItem.updatedAt =
                      now;
                  }
                );
              }
            }
          }
        );

        Alert.alert(
          'Success',
          'Stock updated successfully!'
        );

        setShowReviewModal(
          false
        );

        setScannedItems([]);

      } catch (error) {

        console.error(
          'DB Save Error:',
          error
        );

        Alert.alert(
          'Database Error',
          'Could not save scanned items.'
        );
      }
    };


  /*
   * =========================================================
   * UPDATE SCANNED ITEM
   * =========================================================
   */

  const updateScannedItem =
    (
      index,
      field,
      value
    ) => {

      const updatedItems =
        [...scannedItems];

      updatedItems[index][field] =
        value;

      setScannedItems(
        updatedItems
      );
    };


  /*
   * =========================================================
   * REMOVE SCANNED ITEM
   * =========================================================
   */

  const removeScannedItem =
    (
      indexToRemove,
      itemName
    ) => {

      Alert.alert(
        'Remove Item',

        `Are you sure you want to remove ${
          itemName ||
          'this item'
        }?`,

        [
          {
            text: 'Cancel',
            style: 'cancel',
          },

          {
            text: 'Remove',
            style: 'destructive',

            onPress:
              () => {

                setScannedItems(
                  previousItems =>
                    previousItems.filter(
                      (
                        _,
                        index
                      ) =>
                        index !==
                        indexToRemove
                    )
                );
              },
          },
        ]
      );
    };


  /*
   * =========================================================
   * OPEN CAMERA
   * =========================================================
   */

  const safeOpenScanner =
    async mode => {

      try {

        /*
         * iOS uses its own permission
         * handling through CameraKit.
         *
         * Android needs explicit
         * runtime permission.
         */
        if (
          Platform.OS ===
          'android'
        ) {

          const granted =
            await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.CAMERA,
              {
                title:
                  'Camera Access Required',

                message:
                  'Storemate needs camera access to scan items and bills.',

                buttonNeutral:
                  'Ask Me Later',

                buttonNegative:
                  'Cancel',

                buttonPositive:
                  'OK',
              }
            );

          if (
            granted !==
            PermissionsAndroid.RESULTS.GRANTED
          ) {

            Alert.alert(
              'Camera Disabled',
              'Please enable camera permissions to scan.'
            );

            return;
          }
        }

        setScanMode(
          mode
        );

      } catch (err) {

        Alert.alert(
          'Hardware Error',
          'Camera could not be initialized.'
        );
      }
    };


  /*
   * =========================================================
   * GALLERY OCR
   * =========================================================
   */

  const handleGalleryUpload =
    async () => {

      let result;

      try {

        result =
          await launchImageLibrary(
            {
              mediaType:
                'photo',

              quality: 1,
            }
          );

        if (
          result.didCancel ||
          result.errorCode ||
          !result.assets
        ) {
          return;
        }

        const imageUri =
          result.assets[0].uri;

        setScanMode(
          null
        );

        setProcessingOCR(
          true
        );

        const startTime =
          Date.now();

        const ocrResult =
          await uploadInvoice(
            imageUri
          );

        const latencyMs =
          Date.now() -
          startTime;

        if (!ocrResult) {
          return;
        }

        if (
          ocrResult.extracted_data &&
          ocrResult.extracted_data.length >
            0
        ) {

          setScannedItems(
            ocrResult.extracted_data
          );

          setShowReviewModal(
            true
          );

          TelemetryService.trackEvent(
            'ocr_scan_success',
            'ocr',
            {
              items_extracted:
                ocrResult
                  .extracted_data
                  .length,

              latency_ms:
                latencyMs,
            }
          );

        } else {

          Alert.alert(
            'No Items Found',
            "The AI couldn't read the items clearly."
          );

          TelemetryService.logError(
            'ocr',
            'AI could not read invoice items clearly'
          );
        }

      } catch (error) {

        Alert.alert(
          'Upload Failed',
          error.message ||
            'Could not open the gallery.'
        );

        TelemetryService.logError(
          'ocr',
          error.message ||
            'Gallery OCR upload failed',
          error.stack
        );

      } finally {

        setProcessingOCR(
          false
        );

        /*
         * Clean up gallery temporary file.
         */
        if (
          result?.assets?.[0]
            ?.uri
        ) {

          RNFS.unlink(
            result.assets[0].uri
          ).catch(
            () => {}
          );
        }
      }
    };


  /*
   * =========================================================
   * CAMERA SCREEN
   * =========================================================
   *
   * IMPORTANT:
   *
   * Do NOT add safe-area padding around Camera.
   *
   * The camera must remain true full-screen.
   *
   * Only the overlay controls are moved
   * using insets.bottom.
   */

  if (scanMode) {

    return (
      <View
        style={
          styles.cameraContainer
        }
      >

        <Camera
          ref={cameraRef}

          style={
            styles.camera
          }

          cameraType={
            CameraType.Back
          }

          scanBarcode={
            scanMode ===
            'barcode'
          }

          onReadCode={
            event => {

              if (
                scanMode ===
                'barcode'
              ) {

                setBarcode(
                  event.nativeEvent
                    .codeStringValue
                );

                setScanMode(
                  null
                );
              }
            }
          }
        />

        {/* ============================================
            CAMERA OVERLAY
            ============================================ */}

        <View
          style={
            styles.scanOverlay
          }
          pointerEvents="none"
        >

          <View
            style={
              styles.scanFrame
            }
          />

          <Text
            style={
              styles.scanHint
            }
          >
            {scanMode ===
            'barcode'
              ? 'Point at the barcode'
              : 'Fit the whole bill in frame'}
          </Text>

        </View>


        {/* ============================================
            INVOICE CAMERA ACTIONS
            ============================================ */}

        {scanMode ===
          'invoice' && (

          <View
            style={[
              styles.cameraActionRow,

              {
                /*
                 * Navigation bar safe area +
                 * enough visual breathing room.
                 */
                bottom:
                  Math.max(
                    insets.bottom +
                      80,
                    110
                  ),
              },
            ]}
          >

            <TouchableOpacity
              style={
                styles.captureBtn
              }

              onPress={
                async () => {

                  let capturedImageUri =
                    null;

                  try {

                    const image =
                      await cameraRef.current.capture();

                    capturedImageUri =
                      image.uri;

                    setScanMode(
                      null
                    );

                    setProcessingOCR(
                      true
                    );

                    const result =
                      await uploadInvoice(
                        image.uri
                      );

                    if (!result) {
                      return;
                    }

                    if (
                      result.extracted_data &&
                      result.extracted_data.length >
                        0
                    ) {

                      setScannedItems(
                        result.extracted_data
                      );

                      setShowReviewModal(
                        true
                      );

                    } else {

                      Alert.alert(
                        'No Items Found',
                        "The AI couldn't read the items clearly."
                      );
                    }

                  } catch (e) {

                    Alert.alert(
                      'Scan Failed',
                      'Could not read the invoice.'
                    );

                  } finally {

                    setProcessingOCR(
                      false
                    );

                    /*
                     * Clean up camera
                     * temporary file.
                     */
                    if (
                      capturedImageUri
                    ) {

                      RNFS.unlink(
                        capturedImageUri
                      ).catch(
                        () => {}
                      );
                    }
                  }
                }
              }

              activeOpacity={
                0.85
              }
            >

              <Text
                style={
                  styles.captureBtnText
                }
              >
                📸 Capture Bill
              </Text>

            </TouchableOpacity>


            <TouchableOpacity
              style={
                styles.galleryBtn
              }

              onPress={
                handleGalleryUpload
              }

              activeOpacity={
                0.85
              }
            >

              <Text
                style={
                  styles.btnText
                }
              >
                🖼️ Upload
              </Text>

            </TouchableOpacity>

          </View>
        )}


        {/* ============================================
            CAMERA CANCEL
            ============================================ */}

        <TouchableOpacity
          style={[
            styles.cancelBtn,

            {
              /*
               * This is the important part
               * for Android navigation modes.
               */
              bottom:
                Math.max(
                  insets.bottom +
                    24,
                  40
                ),
            },
          ]}

          onPress={() =>
            setScanMode(
              null
            )
          }

          activeOpacity={
            0.85
          }
        >

          <Text
            style={
              styles.btnText
            }
          >
            ✕ Cancel
          </Text>

        </TouchableOpacity>

      </View>
    );
  }


  /*
   * =========================================================
   * NORMAL INVENTORY SCREEN
   * =========================================================
   */

  return (
    <View
      style={[
        styles.container,

        {
          /*
           * Dynamic status bar.
           */
          paddingTop:
            Math.max(
              insets.top,
              16
            ),

          /*
           * Dynamic navigation bar.
           */
          paddingBottom:
            Math.max(
              insets.bottom,
              16
            ),

          paddingHorizontal:
            screenPadding,
        },
      ]}
    >

      {/* ================================================
          OCR LOADING MODAL
          ================================================ */}

      <Modal
        visible={
          processingOCR
        }

        transparent

        statusBarTranslucent
      >

        <View
          style={
            styles.loadingOverlay
          }
        >

          <ActivityIndicator
            size="large"
            color="#0C9C4C"
          />

          <Text
            style={
              styles.loadingText
            }
          >
            Reading your bill...
          </Text>

        </View>

      </Modal>


      {/* ================================================
          HEADER
          ================================================ */}

      <View
        style={
          styles.headerRow
        }
      >

        <View
          style={
            styles.headerTextWrap
          }
        >

          <Text
            style={
              styles.header
            }
          >
            Inventory
          </Text>

          <Text
            style={
              styles.headerHinglish
            }
          >
            Bhandar
          </Text>

          <Text
            style={
              styles.headerSub
            }
          >
            {items.length}{' '}
            products
            {lowStockCount >
            0
              ? ` · ${lowStockCount} low stock`
              : ''}
          </Text>

        </View>


        {onClose && (

          <TouchableOpacity
            onPress={
              onClose
            }

            style={
              styles.closeBtn
            }

            activeOpacity={
              0.8
            }
          >

            <Text
              style={
                styles.closeBtnText
              }
            >
              Done
            </Text>

          </TouchableOpacity>

        )}

      </View>


      {/* ================================================
          SCAN BUTTONS
          ================================================ */}

      <View
        style={
          styles.scanRow
        }
      >

        <TouchableOpacity
          style={[
            styles.bigScanBtn,
            {
              backgroundColor:
                '#EAF2FE',
            },
          ]}

          onPress={() =>
            safeOpenScanner(
              'barcode'
            )
          }

          activeOpacity={
            0.8
          }
        >

          <Text
            style={
              styles.bigScanEmoji
            }
          >
            📦
          </Text>

          <Text
            style={[
              styles.bigScanBtnText,
              {
                color:
                  '#1D4ED8',
              },
            ]}
          >
            Scan Barcode
          </Text>

        </TouchableOpacity>


        <TouchableOpacity
          style={[
            styles.bigScanBtn,
            {
              backgroundColor:
                '#FFF6E5',
            },
          ]}

          onPress={() =>
            safeOpenScanner(
              'invoice'
            )
          }

          activeOpacity={
            0.8
          }
        >

          <Text
            style={
              styles.bigScanEmoji
            }
          >
            🧾
          </Text>

          <Text
            style={[
              styles.bigScanBtnText,
              {
                color:
                  '#B7791F',
              },
            ]}
          >
            Scan Bill
          </Text>

        </TouchableOpacity>

      </View>


      {/* ================================================
          MANUAL ADD FORM
          ================================================ */}

      <View
        style={
          styles.addForm
        }
      >

        <Text
          style={
            styles.subHeader
          }
        >
          Or add manually{' '}

          <Text
            style={
              styles.subHeaderHinglish
            }
          >
            (Khud Dalein)
          </Text>

        </Text>


        {/* Barcode + Product */}

        <View
          style={
            styles.row
          }
        >

          <TextInput
            style={[
              styles.input,
              {
                flex: 1,
                marginRight: 10,
              },
            ]}

            placeholder="Barcode (Optional)"

            placeholderTextColor="#9CA3AF"

            value={
              barcode
            }

            onChangeText={
              setBarcode
            }

            returnKeyType="next"
          />


          <TextInput
            style={[
              styles.input,
              {
                flex: 1.5,
              },
            ]}

            placeholder="Product name"

            placeholderTextColor="#9CA3AF"

            value={
              productName
            }

            onChangeText={
              setProductName
            }

            returnKeyType="next"
          />

        </View>


        {/* Prices + Quantity */}

        <View
          style={
            styles.row
          }
        >

          <TextInput
            style={[
              styles.input,
              {
                flex: 1,
                marginRight: 10,
              },
            ]}

            placeholder="Cost ₹"

            placeholderTextColor="#9CA3AF"

            keyboardType="decimal-pad"

            value={
              purchasePrice
            }

            onChangeText={
              setPurchasePrice
            }
          />


          <TextInput
            style={[
              styles.input,
              {
                flex: 1,
                marginRight: 10,
              },
            ]}

            placeholder="Sell ₹"

            placeholderTextColor="#9CA3AF"

            keyboardType="decimal-pad"

            value={
              sellingPrice
            }

            onChangeText={
              setSellingPrice
            }
          />


          <TextInput
            style={[
              styles.input,
              {
                flex: 1,
              },
            ]}

            placeholder="Qty (Kg/Pcs)"

            placeholderTextColor="#9CA3AF"

            keyboardType="decimal-pad"

            value={
              quantity
            }

            onChangeText={
              setQuantity
            }
          />

        </View>


        <Text
          style={
            styles.helperText
          }
        >
          💡 Tip: For loose items, enter total KGs. Name it "Rice (per kg)".
        </Text>


        <TouchableOpacity
          style={
            styles.addBtn
          }

          onPress={
            handleAddItem
          }

          activeOpacity={
            0.85
          }
        >

          <Text
            style={
              styles.btnText
            }
          >
            ➕ Add to Stock
          </Text>

        </TouchableOpacity>

      </View>


      {/* ================================================
          CURRENT STOCK
          ================================================ */}

      <Text
        style={
          styles.subHeader
        }
      >
        Current Stock{' '}

        <Text
          style={
            styles.subHeaderHinglish
          }
        >
          (Abhi ka stock)
        </Text>

      </Text>


      <FlatList
        data={
          items
        }

        keyExtractor={
          item =>
            item.id
        }

        contentContainerStyle={[
          styles.stockListContent,

          {
            /*
             * Always keep final item
             * above Android navigation.
             */
            paddingBottom:
              Math.max(
                insets.bottom +
                  30,
                46
              ),
          },
        ]}

        showsVerticalScrollIndicator={
          false
        }

        keyboardShouldPersistTaps="handled"

        removeClippedSubviews={
          true
        }

        initialNumToRender={
          15
        }

        maxToRenderPerBatch={
          10
        }

        windowSize={
          5
        }

        ListEmptyComponent={
          <View
            style={
              styles.emptyState
            }
          >

            <Text
              style={
                styles.emptyEmoji
              }
            >
              🗄️
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Your shelf is empty
            </Text>

            <Text
              style={
                styles.emptyTextHinglish
              }
            >
              Shelf khali hai
            </Text>

            <Text
              style={
                styles.emptySubtext
              }
            >
              Scan a barcode or a bill to get started
            </Text>

          </View>
        }

        renderItem={({
          item,
        }) => (

          <TouchableOpacity
            style={
              styles.itemCard
            }

            activeOpacity={
              0.7
            }

            onPress={() =>
              openEditModal(
                item
              )
            }
          >

            <View
              style={
                styles.itemInfo
              }
            >

              <Text
                style={
                  styles.itemName
                }
                numberOfLines={
                  2
                }
              >
                {
                  item.productName
                }
              </Text>

              {!!item.barcode && (

                <Text
                  style={
                    styles.itemMeta
                  }
                >
                  #
                  {
                    item.barcode
                  }
                </Text>

              )}

            </View>


            <View
              style={
                styles.itemRight
              }
            >

              <View
                style={
                  styles.itemPriceColumn
                }
              >

                <Text
                  style={
                    styles.itemPrice
                  }
                >
                  ₹
                  {
                    item.sellingPrice
                  }
                </Text>

                <View
                  style={[
                    styles.qtyBadge,

                    item.quantity <=
                      5 &&
                      styles.qtyBadgeLow,
                  ]}
                >

                  <Text
                    style={[
                      styles.qtyBadgeText,

                      item.quantity <=
                        5 && {
                        color:
                          '#E0433B',
                      },
                    ]}
                  >
                    {
                      item.quantity
                    }{' '}
                    left
                  </Text>

                </View>

              </View>


              <Text
                style={
                  styles.itemArrow
                }
              >
                ›
              </Text>

            </View>

          </TouchableOpacity>

        )}
      />


      {/* =================================================
          REVIEW INVOICE MODAL
          ================================================= */}

      <Modal
        visible={
          showReviewModal
        }

        animationType="slide"

        statusBarTranslucent

        onRequestClose={() =>
          setShowReviewModal(
            false
          )
        }
      >

        <KeyboardAvoidingView
          style={
            styles.reviewKeyboardContainer
          }

          behavior={
            Platform.OS ===
            'ios'
              ? 'padding'
              : 'height'
          }
        >

          <View
            style={[
              styles.modalContainer,

              {
                paddingTop:
                  Math.max(
                    insets.top,
                    16
                  ),

                paddingBottom:
                  Math.max(
                    insets.bottom,
                    16
                  ),

                paddingHorizontal:
                  screenPadding,
              },
            ]}
          >

            <View
              style={
                styles.headerRow
              }
            >

              <Text
                style={
                  styles.header
                }
              >
                Review Invoice
              </Text>


              <TouchableOpacity
                onPress={() =>
                  setShowReviewModal(
                    false
                  )
                }

                style={
                  styles.closeBtn
                }

                activeOpacity={
                  0.8
                }
              >

                <Text
                  style={
                    styles.closeBtnText
                  }
                >
                  Discard
                </Text>

              </TouchableOpacity>

            </View>


            <FlatList
              data={
                scannedItems
              }

              keyExtractor={(
                item,
                index
              ) =>
                index.toString()
              }

              showsVerticalScrollIndicator={
                false
              }

              keyboardShouldPersistTaps="handled"

              contentContainerStyle={{
                paddingBottom:
                  Math.max(
                    insets.bottom +
                      24,
                    40
                  ),
              }}

              removeClippedSubviews={
                true
              }

              initialNumToRender={
                15
              }

              maxToRenderPerBatch={
                10
              }

              windowSize={
                5
              }

              renderItem={({
                item,
                index,
              }) => (

                <View
                  style={
                    styles.aiItemCard
                  }
                >

                  <View
                    style={
                      styles.aiItemHeader
                    }
                  >

                    <TextInput
                      style={
                        styles.aiInputName
                      }

                      value={
                        String(
                          item.productName ||
                            ''
                        )
                      }

                      onChangeText={
                        val =>
                          updateScannedItem(
                            index,
                            'productName',
                            val
                          )
                      }

                      multiline={
                        true
                      }

                      returnKeyType="next"
                    />


                    <TouchableOpacity
                      style={
                        styles.aiDeleteBtn
                      }

                      onPress={() =>
                        removeScannedItem(
                          index,
                          item.productName
                        )
                      }

                      activeOpacity={
                        0.8
                      }
                    >

                      <Text
                        style={
                          styles.aiDeleteBtnText
                        }
                      >
                        🗑️
                      </Text>

                    </TouchableOpacity>

                  </View>


                  <View
                    style={
                      styles.aiRow
                    }
                  >

                    <View
                      style={
                        styles.aiInputWrapper
                      }
                    >

                      <Text
                        style={
                          styles.aiLabel
                        }
                      >
                        Qty
                      </Text>

                      <TextInput
                        style={
                          styles.aiInput
                        }

                        keyboardType="decimal-pad"

                        value={String(
                          item.quantity ??
                            ''
                        )}

                        onChangeText={
                          val =>
                            updateScannedItem(
                              index,
                              'quantity',
                              val
                            )
                        }
                      />

                    </View>


                    <View
                      style={
                        styles.aiInputWrapper
                      }
                    >

                      <Text
                        style={
                          styles.aiLabel
                        }
                      >
                        Cost (₹)
                      </Text>

                      <TextInput
                        style={
                          styles.aiInput
                        }

                        keyboardType="decimal-pad"

                        value={String(
                          item.purchasePrice ??
                            ''
                        )}

                        onChangeText={
                          val =>
                            updateScannedItem(
                              index,
                              'purchasePrice',
                              val
                            )
                        }
                      />

                    </View>


                    <View
                      style={
                        styles.aiInputWrapper
                      }
                    >

                      <Text
                        style={
                          styles.aiLabel
                        }
                      >
                        Sell (₹)
                      </Text>

                      <TextInput
                        style={
                          styles.aiInput
                        }

                        keyboardType="decimal-pad"

                        value={String(
                          item.sellingPrice ??
                            ''
                        )}

                        onChangeText={
                          val =>
                            updateScannedItem(
                              index,
                              'sellingPrice',
                              val
                            )
                        }
                      />

                    </View>

                  </View>

                </View>

              )}
            />


            <TouchableOpacity
              style={[
                styles.confirmSaveBtn,

                {
                  marginBottom:
                    Math.max(
                      insets.bottom,
                      20
                    ),
                },
              ]}

              onPress={
                saveScannedItems
              }

              activeOpacity={
                0.85
              }
            >

              <Text
                style={
                  styles.confirmSaveBtnText
                }
              >
                ✅ Save{' '}
                {
                  scannedItems.length
                }{' '}
                Items{' '}

                <Text
                  style={
                    styles.confirmSaveHint
                  }
                >
                  (Pakka Karein)
                </Text>

              </Text>

            </TouchableOpacity>

          </View>

        </KeyboardAvoidingView>

      </Modal>


      {/* =================================================
          EDIT ITEM MODAL
          ================================================= */}

      <Modal
        visible={
          showEditModal
        }

        animationType="fade"

        transparent={
          true
        }

        statusBarTranslucent

        onRequestClose={() =>
          setShowEditModal(
            false
          )
        }
      >

        <KeyboardAvoidingView
          style={
            styles.editModalKeyboard
          }

          behavior={
            Platform.OS ===
            'ios'
              ? 'padding'
              : 'height'
          }
        >

          <View
            style={[
              styles.editModalOverlay,

              {
                paddingTop:
                  insets.top,

                paddingBottom:
                  insets.bottom,
              },
            ]}
          >

            <View
              style={[
                styles.editModalCard,

                {
                  width:
                    editModalWidth,
                },
              ]}
            >

              <View
                style={
                  styles.editModalHeader
                }
              >

                <Text
                  style={
                    styles.header
                  }
                >
                  Edit Product
                </Text>


                <TouchableOpacity
                  onPress={() =>
                    setShowEditModal(
                      false
                    )
                  }

                  style={
                    styles.editCloseBtn
                  }

                  activeOpacity={
                    0.8
                  }
                >

                  <Text
                    style={
                      styles.editCloseText
                    }
                  >
                    ×
                  </Text>

                </TouchableOpacity>

              </View>


              <Text
                style={
                  styles.aiLabel
                }
              >
                Product Name
              </Text>


              <TextInput
                style={
                  styles.input
                }

                value={
                  editName
                }

                onChangeText={
                  setEditName
                }

                returnKeyType="next"
              />


              <View
                style={
                  styles.row
                }
              >

                <View
                  style={
                    styles.editHalfColumn
                  }
                >

                  <Text
                    style={
                      styles.aiLabel
                    }
                  >
                    Price (₹)
                  </Text>

                  <TextInput
                    style={
                      styles.input
                    }

                    keyboardType="decimal-pad"

                    value={
                      editPrice
                    }

                    onChangeText={
                      setEditPrice
                    }
                  />

                </View>


                <View
                  style={
                    styles.editHalfColumnLast
                  }
                >

                  <Text
                    style={
                      styles.aiLabel
                    }
                  >
                    Quantity
                  </Text>

                  <TextInput
                    style={
                      styles.input
                    }

                    keyboardType="decimal-pad"

                    value={
                      editQuantity
                    }

                    onChangeText={
                      setEditQuantity
                    }
                  />

                </View>

              </View>


              <TouchableOpacity
                style={
                  styles.addBtn
                }

                onPress={
                  handleUpdateItem
                }

                activeOpacity={
                  0.85
                }
              >

                <Text
                  style={
                    styles.btnText
                  }
                >
                  💾 Save Changes
                </Text>

              </TouchableOpacity>


              <TouchableOpacity
                style={
                  styles.deleteProductBtn
                }

                onPress={
                  handleDeleteItem
                }

                activeOpacity={
                  0.8
                }
              >

                <Text
                  style={
                    styles.deleteProductText
                  }
                >
                  🗑️ Delete Product
                </Text>

              </TouchableOpacity>

            </View>

          </View>

        </KeyboardAvoidingView>

      </Modal>

    </View>
  );
};


/*
 * =========================================================
 * STYLES
 * =========================================================
 */

const styles =
  StyleSheet.create({

    /*
     * =======================================================
     * NORMAL SCREEN
     * =======================================================
     */

    container: {
      flex: 1,
      backgroundColor:
        '#F5F7F6',
    },

    headerRow: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'flex-start',

      marginTop: 10,

      marginBottom: 20,
    },

    headerTextWrap: {
      flex: 1,

      marginRight: 12,
    },

    header: {
      fontSize: 24,

      color:
        '#1B1F23',

      fontWeight:
        '800',
    },

    headerHinglish: {
      color:
        '#9CA3AF',

      fontSize: 13,

      fontStyle:
        'italic',

      marginTop: 1,
    },

    headerSub: {
      color:
        '#6B7280',

      fontSize: 13,

      marginTop: 6,
    },

    closeBtn: {
      paddingVertical: 8,

      paddingHorizontal: 16,

      backgroundColor:
        '#FFFFFF',

      borderRadius: 8,

      borderWidth: 1,

      borderColor:
        '#EAECEC',
    },

    closeBtnText: {
      color:
        '#1B1F23',

      fontWeight:
        '600',
    },


    /*
     * =======================================================
     * SCAN BUTTONS
     * =======================================================
     */

    scanRow: {
      flexDirection:
        'row',

      marginBottom: 18,

      gap: 10,
    },

    bigScanBtn: {
      flex: 1,

      borderRadius: 14,

      paddingVertical: 18,

      alignItems:
        'center',

      justifyContent:
        'center',

      minHeight: 86,
    },

    bigScanEmoji: {
      fontSize: 24,

      marginBottom: 6,
    },

    bigScanBtnText: {
      fontWeight:
        '700',

      fontSize: 13.5,

      textAlign:
        'center',
    },


    /*
     * =======================================================
     * ADD FORM
     * =======================================================
     */

    addForm: {
      backgroundColor:
        '#FFFFFF',

      padding: 16,

      borderRadius: 14,

      marginBottom: 20,

      borderWidth: 1,

      borderColor:
        '#EAECEC',
    },

    subHeader: {
      color:
        '#1B1F23',

      fontSize: 15,

      fontWeight:
        '700',

      marginBottom: 10,
    },

    subHeaderHinglish: {
      color:
        '#9CA3AF',

      fontWeight:
        '400',

      fontStyle:
        'italic',

      fontSize: 13,
    },

    row: {
      flexDirection:
        'row',

      marginBottom: 10,
    },

    input: {
      backgroundColor:
        '#F5F7F6',

      color:
        '#1B1F23',

      padding: 13,

      borderRadius: 10,

      borderWidth: 1,

      borderColor:
        '#EAECEC',

      marginBottom: 10,

      minHeight: 48,
    },

    addBtn: {
      backgroundColor:
        '#0C9C4C',

      padding: 14,

      minHeight: 50,

      borderRadius: 10,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginTop: 4,
    },

    btnText: {
      color:
        '#fff',

      fontWeight:
        'bold',
    },

    helperText: {
      color:
        '#9CA3AF',

      fontSize: 11,

      fontStyle:
        'italic',

      marginBottom: 15,

      marginLeft: 2,

      lineHeight: 16,
    },


    /*
     * =======================================================
     * STOCK LIST
     * =======================================================
     */

    stockListContent: {
      paddingTop: 2,
    },

    itemCard: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center',

      backgroundColor:
        '#FFFFFF',

      padding: 16,

      borderRadius: 12,

      marginBottom: 10,

      borderWidth: 1,

      borderColor:
        '#EAECEC',

      minHeight: 72,
    },

    itemInfo: {
      flex: 1,

      minWidth: 0,

      paddingRight: 10,
    },

    itemName: {
      color:
        '#1B1F23',

      fontSize: 16,

      fontWeight:
        '600',
    },

    itemMeta: {
      color:
        '#9CA3AF',

      fontSize: 12,

      marginTop: 3,
    },

    itemRight: {
      flexDirection:
        'row',

      alignItems:
        'center',

      flexShrink: 0,

      gap: 10,
    },

    itemPriceColumn: {
      alignItems:
        'flex-end',
    },

    itemPrice: {
      color:
        '#0C9C4C',

      fontSize: 16,

      fontWeight:
        'bold',

      marginBottom: 6,
    },

    qtyBadge: {
      backgroundColor:
        '#E7F7EE',

      paddingHorizontal: 8,

      paddingVertical: 3,

      borderRadius: 8,
    },

    qtyBadgeLow: {
      backgroundColor:
        '#FDECEA',
    },

    qtyBadgeText: {
      color:
        '#0C9C4C',

      fontSize: 11,

      fontWeight:
        '600',
    },

    itemArrow: {
      color:
        '#9CA3AF',

      fontSize: 22,
    },


    /*
     * =======================================================
     * EMPTY STATE
     * =======================================================
     */

    emptyState: {
      alignItems:
        'center',

      paddingTop: 60,

      paddingHorizontal: 20,
    },

    emptyEmoji: {
      fontSize: 40,

      marginBottom: 10,
    },

    emptyText: {
      color:
        '#1B1F23',

      fontSize: 16,

      fontWeight:
        '600',

      textAlign:
        'center',
    },

    emptyTextHinglish: {
      color:
        '#9CA3AF',

      fontSize: 13,

      fontStyle:
        'italic',

      marginTop: 1,
    },

    emptySubtext: {
      color:
        '#6B7280',

      fontSize: 13,

      marginTop: 6,

      textAlign:
        'center',
    },


    /*
     * =======================================================
     * FULL-SCREEN CAMERA
     * =======================================================
     *
     * DO NOT add padding here.
     */

    cameraContainer: {
      flex: 1,

      backgroundColor:
        '#000',
    },

    camera: {
      flex: 1,
    },

    scanOverlay: {
      ...StyleSheet.absoluteFillObject,

      justifyContent:
        'center',

      alignItems:
        'center',
    },

    scanFrame: {
      width: 260,

      height: 350,

      borderWidth: 2,

      borderColor:
        '#0C9C4C',

      borderRadius: 16,
    },

    scanHint: {
      color:
        '#fff',

      marginTop: 16,

      backgroundColor:
        'rgba(0,0,0,0.6)',

      paddingHorizontal: 14,

      paddingVertical: 6,

      borderRadius: 20,

      textAlign:
        'center',
    },

    cameraActionRow: {
      position:
        'absolute',

      left: 20,

      right: 20,

      flexDirection:
        'row',

      justifyContent:
        'space-between',
    },

    captureBtn: {
      flex: 2,

      backgroundColor:
        '#0C9C4C',

      padding: 18,

      minHeight: 56,

      borderRadius: 14,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 10,
    },

    captureBtnText: {
      color:
        '#fff',

      fontWeight:
        'bold',

      textAlign:
        'center',
    },

    galleryBtn: {
      flex: 1,

      backgroundColor:
        '#1D4ED8',

      padding: 18,

      minHeight: 56,

      borderRadius: 14,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    cancelBtn: {
      position:
        'absolute',

      left: 24,

      right: 24,

      backgroundColor:
        '#E0433B',

      padding: 16,

      minHeight: 52,

      borderRadius: 14,

      alignItems:
        'center',

      justifyContent:
        'center',
    },


    /*
     * =======================================================
     * OCR LOADING
     * =======================================================
     */

    loadingOverlay: {
      flex: 1,

      backgroundColor:
        'rgba(27,31,35,0.85)',

      justifyContent:
        'center',

      alignItems:
        'center',
    },

    loadingText: {
      color:
        '#fff',

      marginTop: 14,

      fontSize: 15,
    },


    /*
     * =======================================================
     * REVIEW MODAL
     * =======================================================
     */

    reviewKeyboardContainer: {
      flex: 1,
    },

    modalContainer: {
      flex: 1,

      backgroundColor:
        '#F5F7F6',
    },

    aiItemCard: {
      backgroundColor:
        '#FFFFFF',

      padding: 15,

      borderRadius: 12,

      marginBottom: 15,

      borderWidth: 1,

      borderColor:
        '#EAECEC',
    },

    aiItemHeader: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'flex-start',

      borderBottomWidth: 1,

      borderBottomColor:
        '#EAECEC',

      paddingBottom: 8,

      marginBottom: 15,
    },

    aiInputName: {
      flex: 1,

      color:
        '#1B1F23',

      fontSize: 18,

      fontWeight:
        'bold',

      marginRight: 10,

      minHeight: 45,

      paddingVertical: 8,
    },

    aiDeleteBtn: {
      backgroundColor:
        '#FDECEA',

      padding: 12,

      borderRadius: 8,

      alignSelf:
        'center',
    },

    aiDeleteBtnText: {
      fontSize: 18,
    },

    aiRow: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',
    },

    aiInputWrapper: {
      flex: 1,

      marginHorizontal: 5,

      minWidth: 0,
    },

    aiLabel: {
      color:
        '#6B7280',

      fontSize: 12,

      marginBottom: 5,
    },

    aiInput: {
      backgroundColor:
        '#F5F7F6',

      color:
        '#1B1F23',

      padding: 10,

      minHeight: 46,

      borderRadius: 8,

      borderWidth: 1,

      borderColor:
        '#EAECEC',

      textAlign:
        'center',
    },

    confirmSaveBtn: {
      backgroundColor:
        '#0C9C4C',

      padding: 18,

      minHeight: 56,

      borderRadius: 12,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginTop: 10,
    },

    confirmSaveBtnText: {
      color:
        '#fff',

      fontSize: 16,

      fontWeight:
        'bold',

      textAlign:
        'center',
    },

    confirmSaveHint: {
      fontWeight:
        '600',

      opacity: 0.85,
    },


    /*
     * =======================================================
     * EDIT MODAL
     * =======================================================
     */

    editModalKeyboard: {
      flex: 1,
    },

    editModalOverlay: {
      flex: 1,

      backgroundColor:
        'rgba(0,0,0,0.5)',

      justifyContent:
        'center',

      alignItems:
        'center',

      paddingHorizontal: 16,
    },

    editModalCard: {
      backgroundColor:
        '#fff',

      borderRadius: 16,

      padding: 20,

      maxWidth: 520,
    },

    editModalHeader: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center',

      marginBottom: 15,
    },

    editCloseBtn: {
      width: 40,

      height: 40,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    editCloseText: {
      color:
        '#6B7280',

      fontSize: 28,

      lineHeight: 30,
    },

    editHalfColumn: {
      flex: 1,

      marginRight: 10,
    },

    editHalfColumnLast: {
      flex: 1,
    },

    deleteProductBtn: {
      padding: 15,

      alignItems:
        'center',

      marginTop: 5,
    },

    deleteProductText: {
      color:
        '#E0433B',

      fontWeight:
        'bold',
    },
  });


/*
 * =========================================================
 * WATERMELONDB OBSERVER
 * =========================================================
 */

const enhance =
  withObservables(
    [],
    () => ({
      items:
        database
          .get(
            'inventory_items'
          )
          .query()
          .observe(),
    })
  );


export default enhance(
  InventoryScreen
);