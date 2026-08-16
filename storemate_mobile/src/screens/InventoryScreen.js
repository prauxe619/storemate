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

import {
  requireCurrentUserId,
} from '../core/auth/localUser';


/* ============================================================
   COUNTR INVENTORY
   ============================================================ */


/*
 * ============================================================
 * UNIVERSAL INVENTORY UNITS
 * ============================================================
 *
 * Countr supports common kirana-shop units.
 *
 * Examples:
 *
 * 5 PCS
 * 10 PACK
 * 2 BOX
 * 6 BOTTLE
 * 2 KG
 * 500 GRAM
 * 2 LITRE
 * 500 ML
 * 1 DOZEN
 * 3 STRIP
 * 2 CARTON
 * 4 BUNDLE
 *
 * The internal value is always normalized to uppercase.
 * ============================================================
 */

const INVENTORY_UNITS = [
  'PCS',
  'PACK',
  'BOX',
  'BOTTLE',
  'KG',
  'GRAM',
  'LITRE',
  'ML',
  'DOZEN',
  'STRIP',
  'CARTON',
  'BUNDLE',
];


/*
 * ============================================================
 * UNIT NORMALIZER
 * ============================================================
 *
 * Handles:
 *
 * piece / pieces / pcs
 * packet / packets / pack
 * box / boxes
 * bottle / bottles
 * kg / kilo / kilogram
 * gram / grams / gm / g
 * litre / liter / litre(s)
 * ml / millilitre
 * dozen / dz
 * strip / strips
 * carton / cartons
 * bundle / bundles
 *
 * Also handles common Hindi/Hinglish words from OCR:
 *
 * kilo
 * kilo gram
 * gram
 * litre
 * liter
 * packet
 * pkt
 * dabba
 * bottle
 * piece
 * nag
 * नग
 * पैकेट
 * बोतल
 * डिब्बा
 * किलो
 * ग्राम
 * लीटर
 * मिली
 *
 * Unknown units safely fall back to PCS.
 * ============================================================
 */

const normalizeInventoryUnit = value => {

  const raw =
    String(
      value || ''
    )
      .trim()
      .toLowerCase();

  if (!raw) {
    return 'PCS';
  }


  /*
   * Remove punctuation around unit.
   */

  const cleaned =
    raw
      .replace(
        /[()[\]{}.,:;!?]/g,
        ' '
      )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();


  /*
   * PCS
   */

  if (
    [
      'pcs',
      'pc',
      'piece',
      'pieces',
      'piece(s)',
      'unit',
      'units',
      'item',
      'items',
      'nos',
      'no',
      'number',
      'numbers',
      'nag',
      'n',
      'नग',
      'पीस',
      'पीसेज',
      'piece',
      'single',
      'एक',
    ].includes(cleaned)
  ) {
    return 'PCS';
  }


  /*
   * PACK
   */

  if (
    [
      'pack',
      'packs',
      'packet',
      'packets',
      'pkt',
      'pk',
      'pouch',
      'pouches',
      'sachet',
      'sachets',
      'packet mein',
      'packet me',
      'पैक',
      'पैकेट',
      'पाउच',
      'सैशे',
    ].includes(cleaned)
  ) {
    return 'PACK';
  }


  /*
   * BOX
   */

  if (
    [
      'box',
      'boxes',
      'dabba',
      'dabbas',
      'carton box',
      'डब्बा',
      'डिब्बा',
      'डब्बे',
      'डिब्बे',
    ].includes(cleaned)
  ) {
    return 'BOX';
  }


  /*
   * BOTTLE
   */

  if (
    [
      'bottle',
      'bottles',
      'bot',
      'btl',
      'बोतल',
      'बॉटल',
    ].includes(cleaned)
  ) {
    return 'BOTTLE';
  }


  /*
   * KG
   */

  if (
    [
      'kg',
      'kgs',
      'kilo',
      'kilos',
      'kilogram',
      'kilograms',
      'kilogramme',
      'kilogrammes',
      'kilo gram',
      'kilo grams',
      'kiligram',
      'किलो',
      'किलोग्राम',
      'किलो ग्राम',
    ].includes(cleaned)
  ) {
    return 'KG';
  }


  /*
   * GRAM
   */

  if (
    [
      'g',
      'gm',
      'gms',
      'gram',
      'grams',
      'gramme',
      'grammes',
      'gramm',
      'ग्राम',
      'ग्राम्स',
      'ग्राम में',
    ].includes(cleaned)
  ) {
    return 'GRAM';
  }


  /*
   * LITRE
   */

  if (
    [
      'l',
      'ltr',
      'ltrs',
      'litre',
      'litres',
      'liter',
      'liters',
      'litres',
      'litre(s)',
      'लीटर',
      'लीटर',
      'लीटर्स',
    ].includes(cleaned)
  ) {
    return 'LITRE';
  }


  /*
   * ML
   */

  if (
    [
      'ml',
      'mls',
      'millilitre',
      'millilitres',
      'milliliter',
      'milliliters',
      'milli litre',
      'milli liter',
      'मिली',
      'मिलीलीटर',
      'मिलिलीटर',
    ].includes(cleaned)
  ) {
    return 'ML';
  }


  /*
   * DOZEN
   */

  if (
    [
      'dozen',
      'dozens',
      'dz',
      'doz',
      'दर्जन',
    ].includes(cleaned)
  ) {
    return 'DOZEN';
  }


  /*
   * STRIP
   */

  if (
    [
      'strip',
      'strips',
      'tablet strip',
      'medicine strip',
      'स्ट्रिप',
      'पट्टी',
    ].includes(cleaned)
  ) {
    return 'STRIP';
  }


  /*
   * CARTON
   */

  if (
    [
      'carton',
      'cartons',
      'ctn',
      'गत्ता',
      'कार्टन',
    ].includes(cleaned)
  ) {
    return 'CARTON';
  }


  /*
   * BUNDLE
   */

  if (
    [
      'bundle',
      'bundles',
      'bunch',
      'bunches',
      'गट्ठर',
      'बंडल',
    ].includes(cleaned)
  ) {
    return 'BUNDLE';
  }


  /*
   * Sometimes OCR returns the unit as part of a longer phrase.
   *
   * Example:
   *
   * "500 grams"
   * "2 kg"
   * "1 litre"
   * "5 packets"
   *
   * Detect the unit word even when quantity is included.
   */

  if (
    /\b(kg|kgs|kilo|kilos|kilogram|kilograms)\b/i.test(
      cleaned
    )
  ) {
    return 'KG';
  }

  if (
    /\b(g|gm|gms|gram|grams|gramme|grammes)\b/i.test(
      cleaned
    )
  ) {
    return 'GRAM';
  }

  if (
    /\b(ml|millilitre|millilitres|milliliter|milliliters)\b/i.test(
      cleaned
    )
  ) {
    return 'ML';
  }

  if (
    /\b(l|ltr|ltrs|litre|litres|liter|liters)\b/i.test(
      cleaned
    )
  ) {
    return 'LITRE';
  }

  if (
    /\b(pack|packs|packet|packets|pkt|pouch|pouches)\b/i.test(
      cleaned
    )
  ) {
    return 'PACK';
  }

  if (
    /\b(box|boxes)\b/i.test(
      cleaned
    )
  ) {
    return 'BOX';
  }

  if (
    /\b(bottle|bottles|btl)\b/i.test(
      cleaned
    )
  ) {
    return 'BOTTLE';
  }

  if (
    /\b(dozen|dozens|doz|dz)\b/i.test(
      cleaned
    )
  ) {
    return 'DOZEN';
  }

  if (
    /\b(strip|strips)\b/i.test(
      cleaned
    )
  ) {
    return 'STRIP';
  }

  if (
    /\b(carton|cartons|ctn)\b/i.test(
      cleaned
    )
  ) {
    return 'CARTON';
  }

  if (
    /\b(bundle|bundles|bunch|bunches)\b/i.test(
      cleaned
    )
  ) {
    return 'BUNDLE';
  }

  if (
    /\b(piece|pieces|pcs|pc|nos|items?)\b/i.test(
      cleaned
    )
  ) {
    return 'PCS';
  }


  /*
   * Safe default.
   */

  return 'PCS';
};


/*
 * ============================================================
 * DISPLAY UNIT
 * ============================================================
 */

const displayInventoryUnit = value =>
  normalizeInventoryUnit(
    value
  );


/*
 * ============================================================
 * UNIT SELECTOR
 * ============================================================
 */

const UnitSelector = ({
  value,
  onChange,
  compact = false,
}) => {

  const normalizedValue =
    normalizeInventoryUnit(
      value
    );

  return (
    <View
      style={[
        styles.unitSelector,
        compact &&
          styles.unitSelectorCompact,
      ]}
    >

      {INVENTORY_UNITS.map(
        unit => {

          const active =
            normalizedValue ===
            unit;

          return (
            <TouchableOpacity
              key={unit}

              style={[
                styles.unitChip,

                active &&
                  styles.unitChipActive,
              ]}

              onPress={() =>
                onChange(
                  unit
                )
              }

              activeOpacity={
                0.8
              }
            >

              <Text
                style={[
                  styles.unitChipText,

                  active &&
                    styles.unitChipTextActive,
                ]}
              >
                {unit}
              </Text>

            </TouchableOpacity>
          );
        }
      )}

    </View>
  );
};


/* ============================================================
   MAIN SCREEN
   ============================================================ */

const InventoryScreen = ({
  onClose,
}) => {

  const insets =
    useSafeAreaInsets();

  const {
    width: windowWidth,
    height: windowHeight,
  } = useWindowDimensions();


  /* ==========================================================
     RESPONSIVE
     ========================================================== */

  const screenPadding =
    windowWidth < 360
      ? 14
      : windowWidth < 600
      ? 18
      : 28;

  const editModalWidth =
    Math.min(
      windowWidth - 32,
      520
    );


  /* ==========================================================
     CAMERA
     ========================================================== */

  const cameraRef =
    useRef(null);

  const appState =
    useRef(
      AppState.currentState
    );


  /* ==========================================================
     INVENTORY
     ========================================================== */

  const [
    items,
    setItems,
  ] = useState([]);

  const [
    ownerId,
    setOwnerId,
  ] = useState(null);


  /* ==========================================================
     SCANNER
     ========================================================== */

  const [
    scanMode,
    setScanMode,
  ] = useState(null);

  const [
    processingOCR,
    setProcessingOCR,
  ] = useState(false);


  /* ==========================================================
     OCR REVIEW
     ========================================================== */

  const [
    scannedItems,
    setScannedItems,
  ] = useState([]);

  const [
    showReviewModal,
    setShowReviewModal,
  ] = useState(false);


  /* ==========================================================
     MANUAL ADD
     ========================================================== */

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

  const [
    unit,
    setUnit,
  ] = useState('PCS');


  /* ==========================================================
     EDIT PRODUCT
     ========================================================== */

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
    editBarcode,
    setEditBarcode,
  ] = useState('');

  const [
    editPurchasePrice,
    setEditPurchasePrice,
  ] = useState('');

  const [
    editSellingPrice,
    setEditSellingPrice,
  ] = useState('');

  const [
    editQuantity,
    setEditQuantity,
  ] = useState('');

  const [
    editUnit,
    setEditUnit,
  ] = useState('PCS');


  /* ==========================================================
     APP STATE
     ========================================================== */

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


  /* ==========================================================
     LOAD INVENTORY
     ========================================================== */

  useEffect(() => {

    let subscription =
      null;

    let isMounted =
      true;

    const loadOwnerAndInventory =
      async () => {

        try {

          const currentOwnerId =
            await requireCurrentUserId();

          if (!isMounted) {
            return;
          }

          setOwnerId(
            currentOwnerId
          );

          subscription =
            database
              .get(
                'inventory_items'
              )
              .query(
                Q.where(
                  'owner_id',
                  currentOwnerId
                )
              )
              .observe()
              .subscribe(
                inventoryItems => {

                  if (!isMounted) {
                    return;
                  }

                  setItems(
                    inventoryItems
                  );
                }
              );

        } catch (error) {

          console.error(
            'Inventory observer error:',
            error
          );

          TelemetryService.logError(
            'inventory_observer',
            error?.message ||
              'Could not load inventory',
            error?.stack
          );
        }
      };

    loadOwnerAndInventory();

    return () => {

      isMounted =
        false;

      if (subscription) {
        subscription.unsubscribe();
        subscription = null;
      }
    };

  }, []);


  /* ==========================================================
     SUMMARY
     ========================================================== */

  const lowStockCount =
    items.filter(
      item =>
        Number(
          item.quantity || 0
        ) <= 5
    ).length;

  const outOfStockCount =
    items.filter(
      item =>
        Number(
          item.quantity || 0
        ) <= 0
    ).length;


  /*
   * IMPORTANT:
   *
   * We do NOT add all quantities together because:
   *
   * 5 KG + 10 PCS + 3 PACK
   *
   * is not mathematically meaningful.
   *
   * The summary therefore uses number of products.
   */

  const totalProducts =
    items.length;


  /* ==========================================================
     MANUAL ADD
     ========================================================== */

  const handleAddItem =
    async () => {

      if (
        !productName.trim() ||
        !sellingPrice ||
        !quantity
      ) {
        return Alert.alert(
          'Missing Info',
          'Product name, sell price, and quantity are required.'
        );
      }

      const parsedPurchasePrice =
        parseFloat(
          purchasePrice
        ) || 0;

      const parsedSellingPrice =
        parseFloat(
          sellingPrice
        );

      const parsedQuantity =
        parseFloat(
          quantity
        );

      const normalizedUnit =
        normalizeInventoryUnit(
          unit
        );

      if (
        isNaN(
          parsedSellingPrice
        ) ||
        parsedSellingPrice < 0
      ) {
        return Alert.alert(
          'Invalid price',
          'Please enter a valid selling price.'
        );
      }

      if (
        isNaN(
          parsedQuantity
        ) ||
        parsedQuantity <= 0
      ) {
        return Alert.alert(
          'Invalid quantity',
          'Please enter a valid quantity.'
        );
      }

      try {

        const currentOwnerId =
          ownerId ||
          await requireCurrentUserId();

        if (!ownerId) {
          setOwnerId(
            currentOwnerId
          );
        }

        await database.write(
          async () => {

            await database
              .get(
                'inventory_items'
              )
              .create(item => {

                item.ownerId =
                  currentOwnerId;

                item.barcode =
                  barcode.trim();

                item.productName =
                  productName.trim();

                item.purchasePrice =
                  parsedPurchasePrice;

                item.sellingPrice =
                  parsedSellingPrice;

                item.quantity =
                  parsedQuantity;

                item.unit =
                  normalizedUnit;

                item.isSynced =
                  false;

                item.updatedAt =
                  Date.now();
              });
          }
        );

        TelemetryService.trackEvent(
          'product_added',
          'inventory',
          {
            product_name:
              productName.trim(),

            purchase_price:
              parsedPurchasePrice,

            selling_price:
              parsedSellingPrice,

            quantity:
              parsedQuantity,

            unit:
              normalizedUnit,
          }
        );

        setBarcode('');
        setProductName('');
        setPurchasePrice('');
        setSellingPrice('');
        setQuantity('');
        setUnit('PCS');

      } catch (error) {

        console.error(
          'Add inventory error:',
          error
        );

        Alert.alert(
          'Error',
          error.message ||
            'Could not add product.'
        );
      }
    };


  /* ==========================================================
     OPEN EDIT MODAL
     ========================================================== */

  const openEditModal =
    item => {

      setEditingItem(
        item
      );

      setEditName(
        item.productName || ''
      );

      setEditBarcode(
        item.barcode || ''
      );

      setEditPurchasePrice(
        String(
          item.purchasePrice ??
            ''
        )
      );

      setEditSellingPrice(
        String(
          item.sellingPrice ??
            ''
        )
      );

      setEditQuantity(
        String(
          item.quantity ??
            ''
        )
      );

      setEditUnit(
        normalizeInventoryUnit(
          item.unit
        )
      );

      setShowEditModal(
        true
      );
    };


  /* ==========================================================
     CLOSE EDIT MODAL
     ========================================================== */

  const closeEditModal =
    () => {

      setShowEditModal(
        false
      );

      setEditingItem(
        null
      );

      setEditName('');
      setEditBarcode('');
      setEditPurchasePrice('');
      setEditSellingPrice('');
      setEditQuantity('');
      setEditUnit('PCS');
    };


  /* ==========================================================
     UPDATE PRODUCT
     ========================================================== */

  const handleUpdateItem =
    async () => {

      if (
        !editingItem
      ) {
        return;
      }

      if (
        !editName.trim()
      ) {
        return Alert.alert(
          'Missing Product Name',
          'Please enter the product name.'
        );
      }

      const parsedPurchasePrice =
        parseFloat(
          editPurchasePrice
        ) || 0;

      const parsedSellingPrice =
        parseFloat(
          editSellingPrice
        );

      const parsedQuantity =
        parseFloat(
          editQuantity
        );

      const normalizedUnit =
        normalizeInventoryUnit(
          editUnit
        );

      if (
        isNaN(
          parsedSellingPrice
        ) ||
        parsedSellingPrice < 0
      ) {
        return Alert.alert(
          'Invalid Sell Price',
          'Please enter a valid selling price.'
        );
      }

      if (
        isNaN(
          parsedQuantity
        ) ||
        parsedQuantity < 0
      ) {
        return Alert.alert(
          'Invalid Quantity',
          'Please enter a valid quantity.'
        );
      }

      try {

        await database.write(
          async () => {

            await editingItem.update(
              item => {

                item.productName =
                  editName.trim();

                item.barcode =
                  editBarcode.trim();

                item.purchasePrice =
                  parsedPurchasePrice;

                item.sellingPrice =
                  parsedSellingPrice;

                item.quantity =
                  parsedQuantity;

                item.unit =
                  normalizedUnit;

                item.isSynced =
                  false;

                item.updatedAt =
                  Date.now();
              }
            );
          }
        );

        TelemetryService.trackEvent(
          'product_updated',
          'inventory',
          {
            product_name:
              editName.trim(),

            purchase_price:
              parsedPurchasePrice,

            selling_price:
              parsedSellingPrice,

            quantity:
              parsedQuantity,

            unit:
              normalizedUnit,
          }
        );

        Alert.alert(
          'Updated',
          'Product details have been updated.'
        );

        closeEditModal();

      } catch (error) {

        console.error(
          'Update inventory error:',
          error
        );

        Alert.alert(
          'Update Error',
          error.message ||
            'Could not update product.'
        );
      }
    };


  /* ==========================================================
     DELETE PRODUCT
     ========================================================== */

  const handleDeleteItem =
    () => {

      if (
        !editingItem
      ) {
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

                  TelemetryService.trackEvent(
                    'product_deleted',
                    'inventory',
                    {
                      product_name:
                        editingItem.productName,
                    }
                  );

                  closeEditModal();

                } catch (error) {

                  Alert.alert(
                    'Delete Error',
                    error.message ||
                      'Could not delete product.'
                  );
                }
              },
          },
        ]
      );
    };


  /* ==========================================================
     SAVE OCR ITEMS
     ========================================================== */

  const saveScannedItems =
    async () => {

      try {

        if (
          !scannedItems ||
          scannedItems.length === 0
        ) {
          return Alert.alert(
            'No Items',
            'There are no scanned items to save.'
          );
        }

        const currentOwnerId =
          ownerId ||
          await requireCurrentUserId();

        if (!ownerId) {
          setOwnerId(
            currentOwnerId
          );
        }

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

              const productName =
                String(
                  item.productName ||
                    ''
                ).trim();

              if (
                !productName
              ) {
                continue;
              }

              const normalizedUnit =
                normalizeInventoryUnit(
                  item.unit
                );

              const itemQuantity =
                Number(
                  item.quantity
                ) || 1;

              const itemPurchasePrice =
                Number(
                  item.purchasePrice
                ) || 0;

              const itemSellingPrice =
                Number(
                  item.sellingPrice
                ) || 0;

              /*
               * IMPORTANT:
               *
               * Product name alone is NOT enough anymore.
               *
               * Example:
               *
               * Sugar 500 GRAM
               * Sugar 1 KG
               *
               * These are different stock units.
               *
               * We therefore only merge when both:
               *
               * owner_id
               * product_name
               * unit
               *
               * match.
               */

              const existingRecords =
                await itemsCollection
                  .query(
                    Q.where(
                      'owner_id',
                      currentOwnerId
                    ),

                    Q.where(
                      'product_name',
                      productName
                    ),

                    Q.where(
                      'unit',
                      normalizedUnit
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

                    dbItem.quantity =
                      Number(
                        dbItem.quantity || 0
                      ) +
                      itemQuantity;

                    if (
                      itemPurchasePrice >
                      0
                    ) {
                      dbItem.purchasePrice =
                        itemPurchasePrice;
                    }

                    if (
                      itemSellingPrice >
                      0
                    ) {
                      dbItem.sellingPrice =
                        itemSellingPrice;
                    }

                    dbItem.unit =
                      normalizedUnit;

                    dbItem.isSynced =
                      false;

                    dbItem.updatedAt =
                      now;
                  }
                );

              } else {

                await itemsCollection.create(
                  dbItem => {

                    dbItem.ownerId =
                      currentOwnerId;

                    dbItem.productName =
                      productName;

                    dbItem.quantity =
                      itemQuantity;

                    dbItem.purchasePrice =
                      itemPurchasePrice;

                    dbItem.sellingPrice =
                      itemSellingPrice;

                    dbItem.barcode =
                      String(
                        item.barcode ||
                          ''
                      ).trim();

                    dbItem.unit =
                      normalizedUnit;

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
          'Stock Updated',
          'Your scanned items have been added to inventory.'
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

        TelemetryService.logError(
          'inventory_ocr_save',
          error?.message ||
            'Could not save scanned items',
          error?.stack
        );

        Alert.alert(
          'Database Error',
          error.message ||
            'Could not save scanned items.'
        );
      }
    };


  /* ==========================================================
     UPDATE OCR ITEM
     ========================================================== */

  const updateScannedItem =
    (
      index,
      field,
      value
    ) => {

      const updatedItems =
        [...scannedItems];

      updatedItems[index] = {
        ...updatedItems[index],

        [field]:
          field === 'unit'
            ? normalizeInventoryUnit(
                value
              )
            : value,
      };

      setScannedItems(
        updatedItems
      );
    };


  /* ==========================================================
     REMOVE OCR ITEM
     ========================================================== */

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


  /* ==========================================================
     OPEN SCANNER
     ========================================================== */

  const safeOpenScanner =
    async mode => {

      try {

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
                  'Countr needs camera access to scan products and bills.',

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

      } catch (error) {

        console.error(
          'Camera initialization error:',
          error
        );

        TelemetryService.logError(
          'inventory_camera',
          error?.message ||
            'Camera could not be initialized',
          error?.stack
        );

        Alert.alert(
          'Camera Error',
          'Camera could not be initialized.'
        );
      }
    };


  /* ==========================================================
     GALLERY OCR
     ========================================================== */

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

        if (!imageUri) {
          return;
        }

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

          const normalizedOCRItems =
            ocrResult.extracted_data.map(
              scannedItem => ({
                ...scannedItem,

                unit:
                  normalizeInventoryUnit(
                    scannedItem.unit
                  ),
              })
            );

          setScannedItems(
            normalizedOCRItems
          );

          setShowReviewModal(
            true
          );

          TelemetryService.trackEvent(
            'ocr_scan_success',
            'ocr',
            {
              items_extracted:
                normalizedOCRItems.length,

              latency_ms:
                latencyMs,
            }
          );

        } else {

          Alert.alert(
            'No Items Found',
            "Countr couldn't read the items clearly."
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


  /* ==========================================================
     CAMERA SCREEN
     ========================================================== */

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

                const scannedCode =
                  event.nativeEvent
                    .codeStringValue;

                if (
                  scannedCode
                ) {

                  setBarcode(
                    scannedCode
                  );

                  setScanMode(
                    null
                  );
                }
              }
            }
          }
        />


        <View
          style={
            styles.scanOverlay
          }
          pointerEvents="none"
        >

          <View
            style={
              scanMode ===
              'barcode'
                ? styles.barcodeFrame
                : styles.invoiceFrame
            }
          />

          <Text
            style={
              styles.scanHint
            }
          >
            {scanMode ===
            'barcode'
              ? 'Place the barcode inside the box'
              : 'Fit the whole bill inside the frame'}
          </Text>

        </View>


        {scanMode ===
          'invoice' && (

          <View
            style={[
              styles.cameraActionRow,

              {
                bottom:
                  Math.max(
                    insets.bottom +
                      82,
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

                    if (
                      !cameraRef.current
                    ) {

                      throw new Error(
                        'Camera is not ready.'
                      );
                    }

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

                    const startTime =
                      Date.now();

                    const result =
                      await uploadInvoice(
                        image.uri
                      );

                    const latencyMs =
                      Date.now() -
                      startTime;

                    if (!result) {
                      return;
                    }

                    if (
                      result.extracted_data &&
                      result.extracted_data.length >
                        0
                    ) {

                      const normalizedOCRItems =
                        result.extracted_data.map(
                          scannedItem => ({
                            ...scannedItem,

                            unit:
                              normalizeInventoryUnit(
                                scannedItem.unit
                              ),
                          })
                        );

                      setScannedItems(
                        normalizedOCRItems
                      );

                      setShowReviewModal(
                        true
                      );

                      TelemetryService.trackEvent(
                        'ocr_scan_success',
                        'ocr',
                        {
                          items_extracted:
                            normalizedOCRItems.length,

                          latency_ms:
                            latencyMs,
                        }
                      );

                    } else {

                      Alert.alert(
                        'No Items Found',
                        "Countr couldn't read the invoice clearly."
                      );
                    }

                  } catch (error) {

                    console.error(
                      'Invoice camera error:',
                      error
                    );

                    TelemetryService.logError(
                      'invoice_camera_ocr',
                      error?.message ||
                        'Could not read invoice',
                      error?.stack
                    );

                    Alert.alert(
                      'Scan Failed',
                      error?.message ||
                        'Could not read the invoice.'
                    );

                  } finally {

                    setProcessingOCR(
                      false
                    );

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
                  styles.captureBtnIcon
                }
              >
                📸
              </Text>

              <Text
                style={
                  styles.captureBtnText
                }
              >
                Capture Bill
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
                  styles.galleryBtnIcon
                }
              >
                🖼️
              </Text>

              <Text
                style={
                  styles.galleryBtnText
                }
              >
                Gallery
              </Text>

            </TouchableOpacity>

          </View>
        )}


        <TouchableOpacity
          style={[
            styles.cancelBtn,

            {
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
              styles.cancelBtnText
            }
          >
            ✕  Cancel
          </Text>

        </TouchableOpacity>

      </View>
    );
  }


  /* ==========================================================
     HEADER COMPONENT
     ========================================================== */

  const renderHeader =
    () => (

      <>

        {/* HEADER */}

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

            <View
              style={
                styles.brandRow
              }
            >

              <View
                style={
                  styles.brandDot
                }
              />

              <Text
                style={
                  styles.brandText
                }
              >
                COUNTR
              </Text>

            </View>

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
              {items.length ===
              1
                ? 'product'
                : 'products'}

              {lowStockCount >
              0
                ? `  ·  ${lowStockCount} low stock`
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


        {/* SUMMARY */}

        <View
          style={
            styles.summaryCard
          }
        >

          <View
            style={
              styles.summaryMain
            }
          >

            <View
              style={
                styles.summaryIcon
              }
            >
              <Text
                style={
                  styles.summaryIconText
                }
              >
                📦
              </Text>
            </View>

            <View
              style={
                styles.summaryText
              }
            >

              <Text
                style={
                  styles.summaryLabel
                }
              >
                PRODUCTS IN STOCK
              </Text>

              <Text
                style={
                  styles.summaryValue
                }
              >
                {totalProducts}{' '}
                {totalProducts ===
                1
                  ? 'product'
                  : 'products'}
              </Text>

            </View>

          </View>


          {lowStockCount >
          0 ? (

            <View
              style={
                styles.lowStockPill
              }
            >

              <View
                style={
                  styles.lowStockDot
                }
              />

              <Text
                style={
                  styles.lowStockPillText
                }
              >
                {lowStockCount}{' '}
                low
              </Text>

            </View>

          ) : (

            <View
              style={
                styles.stockGoodPill
              }
            >

              <Text
                style={
                  styles.stockGoodPillText
                }
              >
                ✓ Good
              </Text>

            </View>

          )}

        </View>


        {/* FAST ENTRY */}

        <View
          style={
            styles.scanSection
          }
        >

          <View
            style={
              styles.sectionHeaderRow
            }
          >

            <View>

              <Text
                style={
                  styles.sectionEyebrow
                }
              >
                FAST ENTRY
              </Text>

              <Text
                style={
                  styles.sectionTitle
                }
              >
                Add stock quickly
              </Text>

            </View>

          </View>


          <View
            style={
              styles.scanRow
            }
          >

            <TouchableOpacity
              style={
                styles.scanCard
              }

              onPress={() =>
                safeOpenScanner(
                  'barcode'
                )
              }

              activeOpacity={
                0.8
              }
            >

              <View
                style={
                  styles.scanIconBlue
                }
              >
                <Text
                  style={
                    styles.scanIconText
                  }
                >
                  ▦
                </Text>
              </View>

              <Text
                style={
                  styles.scanCardTitle
                }
              >
                Barcode
              </Text>

              <Text
                style={
                  styles.scanCardSub
                }
              >
                Scan one product
              </Text>

              <Text
                style={
                  styles.scanArrow
                }
              >
                →
              </Text>

            </TouchableOpacity>


            <TouchableOpacity
              style={
                styles.scanCard
              }

              onPress={() =>
                safeOpenScanner(
                  'invoice'
                )
              }

              activeOpacity={
                0.8
              }
            >

              <View
                style={
                  styles.scanIconLime
                }
              >

                <Text
                  style={
                    styles.scanIconTextDark
                  }
                >
                  🧾
                </Text>

              </View>

              <Text
                style={
                  styles.scanCardTitle
                }
              >
                Bill / Invoice
              </Text>

              <Text
                style={
                  styles.scanCardSub
                }
              >
                Add many products
              </Text>

              <Text
                style={
                  styles.scanArrow
                }
              >
                →
              </Text>

            </TouchableOpacity>

          </View>

        </View>


        {/* MANUAL ADD */}

        <View
          style={
            styles.addForm
          }
        >

          <View
            style={
              styles.formHeader
            }
          >

            <View>

              <Text
                style={
                  styles.formEyebrow
                }
              >
                MANUAL ENTRY
              </Text>

              <Text
                style={
                  styles.formTitle
                }
              >
                Add a product
              </Text>

            </View>

            <View
              style={
                styles.manualBadge
              }
            >

              <Text
                style={
                  styles.manualBadgeText
                }
              >
                QUICK
              </Text>

            </View>

          </View>


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
                  marginRight: 8,
                },
              ]}

              placeholder="Barcode"
              placeholderTextColor="#9AA39D"

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
                  flex: 1.7,
                },
              ]}

              placeholder="Product name"
              placeholderTextColor="#9AA39D"

              value={
                productName
              }

              onChangeText={
                setProductName
              }

              returnKeyType="next"
            />

          </View>


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
                  marginRight: 8,
                },
              ]}

              placeholder="Buy ₹"
              placeholderTextColor="#9AA39D"

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
                  marginRight: 8,
                },
              ]}

              placeholder="Sell ₹"
              placeholderTextColor="#9AA39D"

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

              placeholder="Qty"
              placeholderTextColor="#9AA39D"

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
              styles.fieldLabel
            }
          >
            UNIT
          </Text>

          <UnitSelector
            value={
              unit
            }

            onChange={
              setUnit
            }
          />


          <Text
            style={
              styles.helperText
            }
          >
            💡 Example: 500 GRAM, 2 KG, 1 LITRE, 5 PACK, or 10 PCS.
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
                styles.addBtnPlus
              }
            >
              +
            </Text>

            <Text
              style={
                styles.addBtnText
              }
            >
              Add to Stock
            </Text>

          </TouchableOpacity>

        </View>


        {/* CURRENT STOCK */}

        <View
          style={
            styles.stockHeader
          }
        >

          <View>

            <Text
              style={
                styles.sectionEyebrow
              }
            >
              YOUR INVENTORY
            </Text>

            <Text
              style={
                styles.sectionTitle
              }
            >
              Current Stock
            </Text>

          </View>


          {outOfStockCount >
          0 && (

            <View
              style={
                styles.outStockPill
              }
            >

              <Text
                style={
                  styles.outStockText
                }
              >
                {outOfStockCount}{' '}
                out
              </Text>

            </View>

          )}

        </View>

      </>
    );


  /* ==========================================================
     PRODUCT CARD
     ========================================================== */

  const renderProduct =
    ({
      item,
    }) => {

      const itemQuantity =
        Number(
          item.quantity || 0
        );

      const itemUnit =
        displayInventoryUnit(
          item.unit
        );

      const isOut =
        itemQuantity <= 0;

      const isLow =
        itemQuantity > 0 &&
        itemQuantity <= 5;

      return (

        <TouchableOpacity
          style={[
            styles.itemCard,

            isOut &&
              styles.itemCardOut,

            isLow &&
              styles.itemCardLow,
          ]}

          activeOpacity={
            0.75
          }

          onPress={() =>
            openEditModal(
              item
            )
          }
        >

          <View
            style={[
              styles.itemStatusBar,

              isOut &&
                styles.itemStatusBarOut,

              isLow &&
                styles.itemStatusBarLow,
            ]}
          />


          <View
            style={
              styles.productIcon
            }
          >

            <Text
              style={
                styles.productIconText
              }
            >
              {String(
                item.productName ||
                  'P'
              )
                .charAt(0)
                .toUpperCase()}
            </Text>

          </View>


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


            <View
              style={
                styles.priceRow
              }
            >

              <Text
                style={
                  styles.buyPrice
                }
              >
                Buy ₹
                {Number(
                  item.purchasePrice ||
                    0
                ).toFixed(
                  2
                )}
              </Text>

              <Text
                style={
                  styles.priceDivider
                }
              >
                ·
              </Text>

              <Text
                style={
                  styles.sellPrice
                }
              >
                Sell ₹
                {Number(
                  item.sellingPrice ||
                    0
                ).toFixed(
                  2
                )}
              </Text>

            </View>


            {!!item.barcode && (

              <Text
                style={
                  styles.itemMeta
                }
                numberOfLines={
                  1
                }
              >
                Barcode ·{' '}
                {
                  item.barcode
                }
              </Text>

            )}


            <Text
              style={
                styles.tapToEdit
              }
            >
              Tap to edit
            </Text>

          </View>


          <View
            style={
              styles.itemRight
            }
          >

            <View
              style={[
                styles.qtyBadge,

                isLow &&
                  styles.qtyBadgeLow,

                isOut &&
                  styles.qtyBadgeOut,
              ]}
            >

              <Text
                style={[
                  styles.qtyBadgeText,

                  isLow &&
                    styles.qtyBadgeTextLow,

                  isOut &&
                    styles.qtyBadgeTextOut,
                ]}
              >
                {isOut
                  ? 'OUT'
                  : `${itemQuantity} ${itemUnit}`}
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

        </TouchableOpacity>
      );
    };


  /* ==========================================================
     NORMAL SCREEN
     ========================================================== */

  return (
    <View
      style={[
        styles.container,

        {
          paddingTop:
            Math.max(
              insets.top,
              14
            ),

          paddingHorizontal:
            screenPadding,
        },
      ]}
    >

      {/* ======================================================
          OCR LOADING
          ====================================================== */}

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

          <View
            style={
              styles.loadingCard
            }
          >

            <View
              style={
                styles.loadingIcon
              }
            >

              <Text
                style={
                  styles.loadingIconText
                }
              >
                ✨
              </Text>

            </View>

            <ActivityIndicator
              size="small"
              color="#6D9F2E"
            />

            <Text
              style={
                styles.loadingText
              }
            >
              Reading your bill
            </Text>

            <Text
              style={
                styles.loadingSubtext
              }
            >
              Countr is extracting products and quantities
            </Text>

          </View>

        </View>

      </Modal>


      {/* ======================================================
          ONE CONTINUOUS SCROLL
          ====================================================== */}

      <FlatList
        data={
          items
        }

        keyExtractor={
          item =>
            item.id
        }

        renderItem={
          renderProduct
        }

        ListHeaderComponent={
          renderHeader
        }

        ListEmptyComponent={
          <View
            style={
              styles.emptyState
            }
          >

            <View
              style={
                styles.emptyIcon
              }
            >

              <Text
                style={
                  styles.emptyEmoji
                }
              >
                📦
              </Text>

            </View>

            <Text
              style={
                styles.emptyTitle
              }
            >
              Your inventory is empty
            </Text>

            <Text
              style={
                styles.emptyTextHinglish
              }
            >
              Abhi stock nahi hai
            </Text>

            <Text
              style={
                styles.emptySubtext
              }
            >
              Scan a barcode, scan a bill,
              or add a product manually.
            </Text>

          </View>
        }

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
          7
        }

        contentContainerStyle={[
          styles.stockListContent,

          {
            paddingBottom:
              Math.max(
                insets.bottom +
                  30,
                46
              ),
          },
        ]}
      />


      {/* ======================================================
          REVIEW INVOICE MODAL
          ====================================================== */}

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
                styles.modalHeader
              }
            >

              <View>

                <Text
                  style={
                    styles.modalEyebrow
                  }
                >
                  AI SCAN
                </Text>

                <Text
                  style={
                    styles.modalHeaderTitle
                  }
                >
                  Review Invoice
                </Text>

                <Text
                  style={
                    styles.modalHeaderSub
                  }
                >
                  Check quantities, units and prices before saving.
                </Text>

              </View>


              <TouchableOpacity
                onPress={() => {
                  setShowReviewModal(
                    false
                  );

                  setScannedItems(
                    []
                  );
                }}

                style={
                  styles.discardBtn
                }

                activeOpacity={
                  0.8
                }
              >

                <Text
                  style={
                    styles.discardBtnText
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
                `${index}-${item.productName || 'item'}`
              }

              showsVerticalScrollIndicator={
                false
              }

              keyboardShouldPersistTaps="handled"

              contentContainerStyle={{
                paddingBottom:
                  20,
              }}

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

                    <View
                      style={
                        styles.aiNumber
                      }
                    >

                      <Text
                        style={
                          styles.aiNumberText
                        }
                      >
                        {index +
                          1}
                      </Text>

                    </View>


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
                        value =>
                          updateScannedItem(
                            index,
                            'productName',
                            value
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
                        ×
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
                        QTY
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
                          value =>
                            updateScannedItem(
                              index,
                              'quantity',
                              value
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
                        UNIT
                      </Text>

                      <View
                        style={
                          styles.aiUnitValue
                        }
                      >

                        <Text
                          style={
                            styles.aiUnitValueText
                          }
                        >
                          {normalizeInventoryUnit(
                            item.unit
                          )}
                        </Text>

                      </View>

                    </View>

                  </View>


                  <Text
                    style={
                      styles.aiUnitLabel
                    }
                  >
                    SELECT UNIT
                  </Text>

                  <UnitSelector
                    value={
                      item.unit
                    }

                    onChange={
                      value =>
                        updateScannedItem(
                          index,
                          'unit',
                          value
                        )
                    }

                    compact
                  />


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
                        BUY ₹
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
                          value =>
                            updateScannedItem(
                              index,
                              'purchasePrice',
                              value
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
                        SELL ₹
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
                          value =>
                            updateScannedItem(
                              index,
                              'sellingPrice',
                              value
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
                ✓ Save{' '}
                {
                  scannedItems.length
                }{' '}
                Items
              </Text>

              <Text
                style={
                  styles.confirmSaveHint
                }
              >
                Add to inventory
              </Text>

            </TouchableOpacity>

          </View>

        </KeyboardAvoidingView>

      </Modal>


      {/* ======================================================
          EDIT PRODUCT MODAL
          ====================================================== */}

      <Modal
        visible={
          showEditModal
        }

        animationType="fade"

        transparent

        statusBarTranslucent

        onRequestClose={
          closeEditModal
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

              {/* EDIT HEADER */}

              <View
                style={
                  styles.editModalHeader
                }
              >

                <View
                  style={
                    styles.editTitleWrap
                  }
                >

                  <Text
                    style={
                      styles.modalEyebrow
                    }
                  >
                    INVENTORY
                  </Text>

                  <Text
                    style={
                      styles.editModalTitle
                    }
                  >
                    Edit Product
                  </Text>

                </View>


                <TouchableOpacity
                  onPress={
                    closeEditModal
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


              {/* PRODUCT NAME */}

              <Text
                style={
                  styles.fieldLabel
                }
              >
                PRODUCT NAME
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

                placeholder="Product name"
                placeholderTextColor="#9AA39D"

                returnKeyType="next"
              />


              {/* BARCODE */}

              <Text
                style={
                  styles.fieldLabel
                }
              >
                BARCODE
              </Text>

              <TextInput
                style={
                  styles.input
                }

                value={
                  editBarcode
                }

                onChangeText={
                  setEditBarcode
                }

                placeholder="Barcode"
                placeholderTextColor="#9AA39D"

                keyboardType="numeric"

                returnKeyType="next"
              />


              {/* BUY + SELL */}

              <View
                style={
                  styles.editPriceRow
                }
              >

                <View
                  style={
                    styles.editPriceColumn
                  }
                >

                  <Text
                    style={
                      styles.fieldLabel
                    }
                  >
                    BUY PRICE ₹
                  </Text>

                  <TextInput
                    style={
                      styles.input
                    }

                    value={
                      editPurchasePrice
                    }

                    onChangeText={
                      setEditPurchasePrice
                    }

                    placeholder="0.00"
                    placeholderTextColor="#9AA39D"

                    keyboardType="decimal-pad"
                  />

                </View>


                <View
                  style={
                    styles.editPriceColumn
                  }
                >

                  <Text
                    style={
                      styles.fieldLabel
                    }
                  >
                    SELL PRICE ₹
                  </Text>

                  <TextInput
                    style={
                      styles.input
                    }

                    value={
                      editSellingPrice
                    }

                    onChangeText={
                      setEditSellingPrice
                    }

                    placeholder="0.00"
                    placeholderTextColor="#9AA39D"

                    keyboardType="decimal-pad"
                  />

                </View>

              </View>


              {/* QUANTITY */}

              <Text
                style={
                  styles.fieldLabel
                }
              >
                QUANTITY
              </Text>

              <TextInput
                style={
                  styles.input
                }

                value={
                  editQuantity
                }

                onChangeText={
                  setEditQuantity
                }

                placeholder="0"
                placeholderTextColor="#9AA39D"

                keyboardType="decimal-pad"
              />


              {/* UNIT */}

              <Text
                style={
                  styles.fieldLabel
                }
              >
                UNIT
              </Text>

              <UnitSelector
                value={
                  editUnit
                }

                onChange={
                  setEditUnit
                }

                compact
              />


              {/* SAVE */}

              <TouchableOpacity
                style={
                  styles.saveChangesBtn
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
                    styles.saveChangesText
                  }
                >
                  Save Changes
                </Text>

                <Text
                  style={
                    styles.saveChangesArrow
                  }
                >
                  →
                </Text>

              </TouchableOpacity>


              {/* DELETE */}

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
                  Delete Product
                </Text>

              </TouchableOpacity>

            </View>

          </View>

        </KeyboardAvoidingView>

      </Modal>

    </View>
  );
};


/* ============================================================
   STYLES
   ============================================================ */

const styles =
  StyleSheet.create({

    /* ========================================================
       MAIN
       ======================================================== */

    container: {
      flex: 1,

      backgroundColor:
        '#F5F7F5',
    },


    /* ========================================================
       HEADER
       ======================================================== */

    headerRow: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center',

      marginBottom: 18,
    },

    headerTextWrap: {
      flex: 1,

      minWidth: 0,

      marginRight: 12,
    },

    brandRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      marginBottom: 3,
    },

    brandDot: {
      width: 7,

      height: 7,

      borderRadius: 7,

      backgroundColor:
        '#7EA935',

      marginRight: 6,
    },

    brandText: {
      color:
        '#5D8D28',

      fontSize: 9,

      fontWeight:
        '900',

      letterSpacing:
        2,
    },

    header: {
      color:
        '#142019',

      fontSize: 25,

      lineHeight: 29,

      fontWeight:
        '900',

      letterSpacing:
        -0.7,
    },

    headerHinglish: {
      color:
        '#7E8982',

      fontSize: 11,

      fontStyle:
        'italic',

      marginTop: 2,
    },

    headerSub: {
      color:
        '#7E8982',

      fontSize: 11,

      marginTop: 4,
    },

    closeBtn: {
      minWidth: 61,

      height: 40,

      paddingHorizontal: 14,

      borderRadius: 13,

      backgroundColor:
        '#FFFFFF',

      borderWidth: 1,

      borderColor:
        '#E0E5E1',

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    closeBtnText: {
      color:
        '#29352E',

      fontSize: 12,

      fontWeight:
        '800',
    },


    /* ========================================================
       SUMMARY
       ======================================================== */

    summaryCard: {
      minHeight: 72,

      backgroundColor:
        '#FFFFFF',

      borderRadius: 20,

      borderWidth: 1,

      borderColor:
        '#E0E6E0',

      paddingHorizontal: 14,

      paddingVertical: 12,

      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      marginBottom: 20,

      shadowColor:
        '#102015',

      shadowOffset: {
        width: 0,

        height: 3,
      },

      shadowOpacity:
        0.035,

      shadowRadius:
        10,

      elevation: 1,
    },

    summaryMain: {
      flexDirection:
        'row',

      alignItems:
        'center',

      flex: 1,
    },

    summaryIcon: {
      width: 45,

      height: 45,

      borderRadius: 14,

      backgroundColor:
        '#B8FF3D',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 12,
    },

    summaryIconText: {
      fontSize: 20,
    },

    summaryText: {
      flex: 1,
    },

    summaryLabel: {
      color:
        '#8B948E',

      fontSize: 8,

      fontWeight:
        '900',

      letterSpacing:
        1.5,

      marginBottom: 3,
    },

    summaryValue: {
      color:
        '#17231B',

      fontSize: 15,

      fontWeight:
        '900',
    },

    lowStockPill: {
      flexDirection:
        'row',

      alignItems:
        'center',

      paddingHorizontal: 9,

      paddingVertical: 6,

      borderRadius: 9,

      backgroundColor:
        '#FFF2EE',
    },

    lowStockDot: {
      width: 5,

      height: 5,

      borderRadius: 5,

      backgroundColor:
        '#D65B4D',

      marginRight: 5,
    },

    lowStockPillText: {
      color:
        '#B34D42',

      fontSize: 8,

      fontWeight:
        '900',

      letterSpacing:
        0.5,
    },

    stockGoodPill: {
      paddingHorizontal: 9,

      paddingVertical: 6,

      borderRadius: 9,

      backgroundColor:
        '#EFF8E8',
    },

    stockGoodPillText: {
      color:
        '#5D8D28',

      fontSize: 8,

      fontWeight:
        '900',
    },


    /* ========================================================
       SECTIONS
       ======================================================== */

    scanSection: {
      marginBottom: 18,
    },

    sectionHeaderRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      marginBottom: 10,
    },

    sectionEyebrow: {
      color:
        '#669329',

      fontSize: 8,

      fontWeight:
        '900',

      letterSpacing:
        1.6,

      marginBottom: 3,
    },

    sectionTitle: {
      color:
        '#17231B',

      fontSize: 17,

      fontWeight:
        '900',

      letterSpacing:
        -0.3,
    },


    /* ========================================================
       SCAN
       ======================================================== */

    scanRow: {
      flexDirection:
        'row',

      gap: 10,
    },

    scanCard: {
      flex: 1,

      minHeight: 125,

      padding: 14,

      borderRadius: 20,

      backgroundColor:
        '#FFFFFF',

      borderWidth: 1,

      borderColor:
        '#E0E6E0',

      position:
        'relative',

      shadowColor:
        '#102015',

      shadowOffset: {
        width: 0,

        height: 3,
      },

      shadowOpacity:
        0.035,

      shadowRadius:
        10,

      elevation: 1,
    },

    scanIconBlue: {
      width: 40,

      height: 40,

      borderRadius: 13,

      backgroundColor:
        '#EAF2FE',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginBottom: 13,
    },

    scanIconLime: {
      width: 40,

      height: 40,

      borderRadius: 13,

      backgroundColor:
        '#EAF6DF',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginBottom: 13,
    },

    scanIconText: {
      color:
        '#2563D8',

      fontSize: 20,

      fontWeight:
        '900',
    },

    scanIconTextDark: {
      fontSize: 18,
    },

    scanCardTitle: {
      color:
        '#17231B',

      fontSize: 14,

      fontWeight:
        '900',
    },

    scanCardSub: {
      color:
        '#7D8780',

      fontSize: 9.5,

      marginTop: 4,
    },

    scanArrow: {
      position:
        'absolute',

      right: 14,

      bottom: 12,

      color:
        '#6C8E48',

      fontSize: 18,

      fontWeight:
        '900',
    },


    /* ========================================================
       FORM
       ======================================================== */

    addForm: {
      backgroundColor:
        '#FFFFFF',

      borderRadius: 21,

      borderWidth: 1,

      borderColor:
        '#E0E6E0',

      padding: 16,

      marginBottom: 22,

      shadowColor:
        '#102015',

      shadowOffset: {
        width: 0,

        height: 3,
      },

      shadowOpacity:
        0.035,

      shadowRadius:
        10,

      elevation: 1,
    },

    formHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      marginBottom: 13,
    },

    formEyebrow: {
      color:
        '#669329',

      fontSize: 8,

      fontWeight:
        '900',

      letterSpacing:
        1.5,

      marginBottom: 3,
    },

    formTitle: {
      color:
        '#17231B',

      fontSize: 16,

      fontWeight:
        '900',
    },

    manualBadge: {
      backgroundColor:
        '#F0F5EC',

      paddingHorizontal: 8,

      paddingVertical: 5,

      borderRadius: 8,
    },

    manualBadgeText: {
      color:
        '#6A912F',

      fontSize: 7,

      fontWeight:
        '900',

      letterSpacing:
        0.8,
    },

    row: {
      flexDirection:
        'row',

      marginBottom: 8,
    },

    input: {
      backgroundColor:
        '#F7F9F6',

      color:
        '#142019',

      paddingHorizontal: 12,

      paddingVertical: 11,

      borderRadius: 12,

      borderWidth: 1,

      borderColor:
        '#DDE4DD',

      minHeight: 47,

      fontSize: 12,

      fontWeight:
        '600',
    },

    helperText: {
      color:
        '#8B948E',

      fontSize: 9.5,

      lineHeight: 15,

      marginBottom: 13,
    },

    addBtn: {
      minHeight: 51,

      borderRadius: 15,

      backgroundColor:
        '#B8FF3D',

      alignItems:
        'center',

      justifyContent:
        'center',

      flexDirection:
        'row',

      shadowColor:
        '#6C962D',

      shadowOffset: {
        width: 0,

        height: 3,
      },

      shadowOpacity:
        0.13,

      shadowRadius:
        8,

      elevation: 2,
    },

    addBtnPlus: {
      color:
        '#102015',

      fontSize: 21,

      fontWeight:
        '500',

      marginRight: 7,
    },

    addBtnText: {
      color:
        '#102015',

      fontSize: 13,

      fontWeight:
        '900',
    },


    /* ========================================================
       UNIT SELECTOR
       ======================================================== */

    unitSelector: {
      flexDirection:
        'row',

      flexWrap:
        'wrap',

      marginBottom: 10,

      gap: 7,
    },

    unitSelectorCompact: {
      marginBottom: 9,
    },

    unitChip: {
      minHeight: 34,

      paddingHorizontal: 11,

      borderRadius: 10,

      backgroundColor:
        '#F3F6F2',

      borderWidth: 1,

      borderColor:
        '#DDE4DD',

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    unitChipActive: {
      backgroundColor:
        '#B8FF3D',

      borderColor:
        '#A7E83A',
    },

    unitChipText: {
      color:
        '#69746D',

      fontSize: 9,

      fontWeight:
        '900',
    },

    unitChipTextActive: {
      color:
        '#102015',
    },


    /* ========================================================
       STOCK HEADER
       ======================================================== */

    stockHeader: {
      flexDirection:
        'row',

      alignItems:
        'flex-end',

      justifyContent:
        'space-between',

      marginBottom: 10,
    },

    outStockPill: {
      backgroundColor:
        '#FFF0EE',

      paddingHorizontal: 9,

      paddingVertical: 6,

      borderRadius: 9,

      marginBottom: 2,
    },

    outStockText: {
      color:
        '#C14D45',

      fontSize: 8,

      fontWeight:
        '900',
    },


    /* ========================================================
       PRODUCT CARD
       ======================================================== */

    stockListContent: {
      paddingTop: 1,
    },

    itemCard: {
      minHeight: 92,

      backgroundColor:
        '#FFFFFF',

      borderRadius: 19,

      borderWidth: 1,

      borderColor:
        '#E0E6E0',

      marginBottom: 10,

      paddingVertical: 13,

      paddingRight: 11,

      flexDirection:
        'row',

      alignItems:
        'center',

      overflow:
        'hidden',

      shadowColor:
        '#102015',

      shadowOffset: {
        width: 0,

        height: 3,
      },

      shadowOpacity:
        0.03,

      shadowRadius:
        9,

      elevation: 1,
    },

    itemCardLow: {
      borderColor:
        '#E9E0D5',
    },

    itemCardOut: {
      borderColor:
        '#EBDDDD',
    },

    itemStatusBar: {
      width: 4,

      height: 58,

      borderRadius: 4,

      backgroundColor:
        '#B8FF3D',

      marginRight: 12,
    },

    itemStatusBarLow: {
      backgroundColor:
        '#E6A940',
    },

    itemStatusBarOut: {
      backgroundColor:
        '#D85A50',
    },

    productIcon: {
      width: 43,

      height: 43,

      borderRadius: 14,

      backgroundColor:
        '#F0F4EF',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 11,
    },

    productIconText: {
      color:
        '#668E30',

      fontSize: 16,

      fontWeight:
        '900',
    },

    itemInfo: {
      flex: 1,

      minWidth: 0,

      paddingRight: 5,
    },

    itemName: {
      color:
        '#17231B',

      fontSize: 14,

      lineHeight: 18,

      fontWeight:
        '800',
    },

    priceRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      marginTop: 4,
    },

    buyPrice: {
      color:
        '#8A938D',

      fontSize: 9,

      fontWeight:
        '700',
    },

    priceDivider: {
      color:
        '#B0B7B2',

      fontSize: 9,

      marginHorizontal: 5,
    },

    sellPrice: {
      color:
        '#5D8D28',

      fontSize: 9,

      fontWeight:
        '900',
    },

    itemMeta: {
      color:
        '#9AA39D',

      fontSize: 8,

      marginTop: 3,
    },

    tapToEdit: {
      color:
        '#A1AAA4',

      fontSize: 8,

      marginTop: 4,
    },

    itemRight: {
      alignItems:
        'flex-end',

      justifyContent:
        'center',

      marginLeft: 5,

      flexShrink: 0,
    },

    qtyBadge: {
      backgroundColor:
        '#EFF8E8',

      paddingHorizontal: 8,

      paddingVertical: 5,

      borderRadius: 8,
    },

    qtyBadgeLow: {
      backgroundColor:
        '#FFF3E3',
    },

    qtyBadgeOut: {
      backgroundColor:
        '#FFF0EE',
    },

    qtyBadgeText: {
      color:
        '#5D8D28',

      fontSize: 8,

      fontWeight:
        '900',
    },

    qtyBadgeTextLow: {
      color:
        '#B27620',
    },

    qtyBadgeTextOut: {
      color:
        '#C14D45',
    },

    itemArrow: {
      color:
        '#9AA39D',

      fontSize: 22,

      fontWeight:
        '300',

      marginLeft: 4,
    },


    /* ========================================================
       EMPTY
       ======================================================== */

    emptyState: {
      alignItems:
        'center',

      paddingTop: 45,

      paddingHorizontal: 30,

      paddingBottom: 30,
    },

    emptyIcon: {
      width: 68,

      height: 68,

      borderRadius: 22,

      backgroundColor:
        '#EAF5E2',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginBottom: 13,
    },

    emptyEmoji: {
      fontSize: 28,
    },

    emptyTitle: {
      color:
        '#17231B',

      fontSize: 17,

      fontWeight:
        '900',

      textAlign:
        'center',
    },

    emptyTextHinglish: {
      color:
        '#7F8982',

      fontSize: 11,

      fontStyle:
        'italic',

      marginTop: 3,
    },

    emptySubtext: {
      color:
        '#939C96',

      fontSize: 10,

      lineHeight: 16,

      textAlign:
        'center',

      marginTop: 7,
    },


    /* ========================================================
       CAMERA
       ======================================================== */

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

    barcodeFrame: {
      width: 280,

      height: 145,

      borderWidth: 2,

      borderColor:
        '#B8FF3D',

      borderRadius: 18,
    },

    invoiceFrame: {
      width: 285,

      height: 390,

      borderWidth: 2,

      borderColor:
        '#B8FF3D',

      borderRadius: 18,
    },

    scanHint: {
      color:
        '#FFFFFF',

      marginTop: 17,

      backgroundColor:
        'rgba(0,0,0,0.65)',

      paddingHorizontal: 15,

      paddingVertical: 8,

      borderRadius: 20,

      fontSize: 11,

      fontWeight:
        '700',

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

      minHeight: 58,

      backgroundColor:
        '#B8FF3D',

      borderRadius: 16,

      alignItems:
        'center',

      justifyContent:
        'center',

      flexDirection:
        'row',

      marginRight: 9,
    },

    captureBtnIcon: {
      fontSize: 16,

      marginRight: 7,
    },

    captureBtnText: {
      color:
        '#102015',

      fontWeight:
        '900',

      fontSize: 13,
    },

    galleryBtn: {
      flex: 1,

      minHeight: 58,

      backgroundColor:
        '#FFFFFF',

      borderRadius: 16,

      alignItems:
        'center',

      justifyContent:
        'center',

      flexDirection:
        'row',
    },

    galleryBtnIcon: {
      fontSize: 14,

      marginRight: 5,
    },

    galleryBtnText: {
      color:
        '#17231B',

      fontWeight:
        '900',

      fontSize: 12,
    },

    cancelBtn: {
      position:
        'absolute',

      left: 24,

      right: 24,

      minHeight: 50,

      backgroundColor:
        'rgba(20,32,25,0.82)',

      borderWidth: 1,

      borderColor:
        'rgba(255,255,255,0.2)',

      paddingHorizontal: 16,

      borderRadius: 15,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    cancelBtnText: {
      color:
        '#FFFFFF',

      fontSize: 12,

      fontWeight:
        '800',
    },


    /* ========================================================
       LOADING
       ======================================================== */

    loadingOverlay: {
      flex: 1,

      backgroundColor:
        'rgba(20,32,25,0.42)',

      justifyContent:
        'center',

      alignItems:
        'center',

      paddingHorizontal: 25,
    },

    loadingCard: {
      width: '100%',

      maxWidth: 320,

      padding: 24,

      borderRadius: 23,

      backgroundColor:
        '#FFFFFF',

      alignItems:
        'center',

      shadowColor:
        '#000',

      shadowOffset: {
        width: 0,

        height: 10,
      },

      shadowOpacity:
        0.15,

      shadowRadius:
        25,

      elevation: 8,
    },

    loadingIcon: {
      width: 48,

      height: 48,

      borderRadius: 15,

      backgroundColor:
        '#EAF6DF',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginBottom: 15,
    },

    loadingIconText: {
      fontSize: 20,
    },

    loadingText: {
      color:
        '#17231B',

      fontSize: 15,

      fontWeight:
        '900',

      marginTop: 12,
    },

    loadingSubtext: {
      color:
        '#89928C',

      fontSize: 10,

      lineHeight: 15,

      textAlign:
        'center',

      marginTop: 5,
    },


    /* ========================================================
       REVIEW MODAL
       ======================================================== */

    reviewKeyboardContainer: {
      flex: 1,
    },

    modalContainer: {
      flex: 1,

      backgroundColor:
        '#F5F7F5',
    },

    modalHeader: {
      flexDirection:
        'row',

      alignItems:
        'flex-start',

      justifyContent:
        'space-between',

      marginBottom: 17,
    },

    modalEyebrow: {
      color:
        '#669329',

      fontSize: 8,

      fontWeight:
        '900',

      letterSpacing:
        1.6,

      marginBottom: 4,
    },

    modalHeaderTitle: {
      color:
        '#142019',

      fontSize: 23,

      fontWeight:
        '900',

      letterSpacing:
        -0.5,
    },

    modalHeaderSub: {
      color:
        '#7D8780',

      fontSize: 10,

      marginTop: 4,
    },

    discardBtn: {
      minHeight: 38,

      paddingHorizontal: 12,

      borderRadius: 11,

      backgroundColor:
        '#FFFFFF',

      borderWidth: 1,

      borderColor:
        '#E0E5E1',

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    discardBtnText: {
      color:
        '#8A514D',

      fontSize: 10,

      fontWeight:
        '800',
    },

    aiItemCard: {
      backgroundColor:
        '#FFFFFF',

      padding: 14,

      borderRadius: 19,

      marginBottom: 10,

      borderWidth: 1,

      borderColor:
        '#E0E6E0',
    },

    aiItemHeader: {
      flexDirection:
        'row',

      alignItems:
        'flex-start',

      borderBottomWidth: 1,

      borderBottomColor:
        '#EDF0ED',

      paddingBottom: 10,

      marginBottom: 12,
    },

    aiNumber: {
      width: 28,

      height: 28,

      borderRadius: 9,

      backgroundColor:
        '#EFF6E9',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginRight: 8,

      marginTop: 3,
    },

    aiNumberText: {
      color:
        '#67922D',

      fontSize: 10,

      fontWeight:
        '900',
    },

    aiInputName: {
      flex: 1,

      color:
        '#17231B',

      fontSize: 14,

      fontWeight:
        '800',

      marginRight: 8,

      minHeight: 39,

      paddingVertical: 6,
    },

    aiDeleteBtn: {
      width: 34,

      height: 34,

      borderRadius: 10,

      backgroundColor:
        '#FFF0EE',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginTop: 1,
    },

    aiDeleteBtnText: {
      color:
        '#C8554D',

      fontSize: 22,

      fontWeight:
        '300',

      lineHeight: 24,
    },

    aiRow: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      marginBottom: 9,
    },

    aiInputWrapper: {
      flex: 1,

      marginHorizontal: 4,

      minWidth: 0,
    },

    aiLabel: {
      color:
        '#87918A',

      fontSize: 8,

      fontWeight:
        '900',

      letterSpacing:
        0.8,

      marginBottom: 5,
    },

    aiInput: {
      backgroundColor:
        '#F7F9F6',

      color:
        '#17231B',

      paddingHorizontal: 9,

      minHeight: 44,

      borderRadius: 10,

      borderWidth: 1,

      borderColor:
        '#DDE4DD',

      textAlign:
        'center',

      fontSize: 12,

      fontWeight:
        '700',
    },

    aiUnitValue: {
      backgroundColor:
        '#EFF8E8',

      borderRadius: 10,

      borderWidth: 1,

      borderColor:
        '#D8E7CF',

      minHeight: 44,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    aiUnitValueText: {
      color:
        '#5D8D28',

      fontSize: 11,

      fontWeight:
        '900',
    },

    aiUnitLabel: {
      color:
        '#87918A',

      fontSize: 8,

      fontWeight:
        '900',

      letterSpacing:
        0.8,

      marginTop: 2,

      marginBottom: 6,
    },

    confirmSaveBtn: {
      minHeight: 59,

      borderRadius: 16,

      backgroundColor:
        '#B8FF3D',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginTop: 8,
    },

    confirmSaveBtnText: {
      color:
        '#102015',

      fontSize: 14,

      fontWeight:
        '900',
    },

    confirmSaveHint: {
      color:
        '#536A35',

      fontSize: 9,

      fontWeight:
        '700',

      marginTop: 3,
    },


    /* ========================================================
       EDIT MODAL
       ======================================================== */

    editModalKeyboard: {
      flex: 1,
    },

    editModalOverlay: {
      flex: 1,

      backgroundColor:
        'rgba(20,32,25,0.4)',

      justifyContent:
        'center',

      alignItems:
        'center',

      paddingHorizontal: 16,
    },

    editModalCard: {
      backgroundColor:
        '#FFFFFF',

      borderRadius: 24,

      padding: 20,

      maxWidth: 520,

      borderWidth: 1,

      borderColor:
        '#E0E6E0',

      shadowColor:
        '#102015',

      shadowOffset: {
        width: 0,

        height: 12,
      },

      shadowOpacity:
        0.15,

      shadowRadius:
        25,

      elevation: 8,

      maxHeight:
        '92%',
    },

    editModalHeader: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'flex-start',

      marginBottom: 18,
    },

    editTitleWrap: {
      flex: 1,
    },

    editModalTitle: {
      color:
        '#142019',

      fontSize: 21,

      fontWeight:
        '900',

      letterSpacing:
        -0.4,
    },

    editCloseBtn: {
      width: 38,

      height: 38,

      borderRadius: 12,

      backgroundColor:
        '#F1F4F1',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginLeft: 10,
    },

    editCloseText: {
      color:
        '#59645D',

      fontSize: 25,

      lineHeight: 28,

      fontWeight:
        '300',
    },

    fieldLabel: {
      color:
        '#87918A',

      fontSize: 8,

      fontWeight:
        '900',

      letterSpacing:
        1.1,

      marginBottom: 5,

      marginTop: 3,
    },

    editPriceRow: {
      flexDirection:
        'row',

      gap: 10,
    },

    editPriceColumn: {
      flex: 1,
    },

    saveChangesBtn: {
      minHeight: 51,

      borderRadius: 15,

      backgroundColor:
        '#B8FF3D',

      alignItems:
        'center',

      justifyContent:
        'center',

      flexDirection:
        'row',

      marginTop: 10,
    },

    saveChangesText: {
      color:
        '#102015',

      fontSize: 13,

      fontWeight:
        '900',
    },

    saveChangesArrow: {
      color:
        '#102015',

      fontSize: 19,

      fontWeight:
        '900',

      marginLeft: 8,
    },

    deleteProductBtn: {
      minHeight: 45,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginTop: 6,
    },

    deleteProductText: {
      color:
        '#C8554D',

      fontSize: 11,

      fontWeight:
        '800',
    },

  });


export default InventoryScreen;