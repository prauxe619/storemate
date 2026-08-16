import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../config/api';
import TelemetryService from './TelemetryService';


/* ============================================================
   UNIVERSAL INVENTORY UNIT NORMALIZER
   ============================================================ */

const normalizeInventoryUnit = value => {
  const raw = String(value || '')
    .trim()
    .toLowerCase();

  if (!raw) {
    return 'PCS';
  }

  const cleaned = raw
    .replace(/[()[\]{}.,:;!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();


  /* ==========================================================
     PCS
     ========================================================== */

  if (
    [
      'pcs',
      'pc',
      'piece',
      'pieces',
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
    ].includes(cleaned)
  ) {
    return 'PCS';
  }


  /* ==========================================================
     PACK
     ========================================================== */

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
      'पैक',
      'पैकेट',
      'पाउच',
      'सैशे',
    ].includes(cleaned)
  ) {
    return 'PACK';
  }


  /* ==========================================================
     BOX
     ========================================================== */

  if (
    [
      'box',
      'boxes',
      'dabba',
      'dabbas',
      'डब्बा',
      'डिब्बा',
      'डब्बे',
      'डिब्बे',
    ].includes(cleaned)
  ) {
    return 'BOX';
  }


  /* ==========================================================
     BOTTLE
     ========================================================== */

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


  /* ==========================================================
     KG
     ========================================================== */

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
      'किलो',
      'किलोग्राम',
      'किलो ग्राम',
    ].includes(cleaned)
  ) {
    return 'KG';
  }


  /* ==========================================================
     GRAM
     ========================================================== */

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
    ].includes(cleaned)
  ) {
    return 'GRAM';
  }


  /* ==========================================================
     LITRE
     ========================================================== */

  if (
    [
      'l',
      'ltr',
      'ltrs',
      'litre',
      'litres',
      'liter',
      'liters',
      'लीटर',
      'लीटर्स',
    ].includes(cleaned)
  ) {
    return 'LITRE';
  }


  /* ==========================================================
     ML
     ========================================================== */

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


  /* ==========================================================
     DOZEN
     ========================================================== */

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


  /* ==========================================================
     STRIP
     ========================================================== */

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


  /* ==========================================================
     CARTON
     ========================================================== */

  if (
    [
      'carton',
      'cartons',
      'ctn',
      'कार्टन',
      'गत्ता',
    ].includes(cleaned)
  ) {
    return 'CARTON';
  }


  /* ==========================================================
     BUNDLE
     ========================================================== */

  if (
    [
      'bundle',
      'bundles',
      'bunch',
      'bunches',
      'बंडल',
      'गट्ठर',
    ].includes(cleaned)
  ) {
    return 'BUNDLE';
  }


  /* ==========================================================
     OCR PHRASE DETECTION
     ==========================================================
     
     Sometimes OCR doesn't return only "kg".

     It may return:

       "500 grams"
       "2 kg"
       "1 litre"
       "5 packets"
       "10 pieces"

     So detect unit words inside the string.
     ========================================================== */

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


  /* ==========================================================
     SAFE DEFAULT
     ========================================================== */

  return 'PCS';
};


/* ============================================================
   EXTRACT UNIT FROM MULTIPLE POSSIBLE BACKEND FIELDS
   ============================================================ */

const extractUnit = item => {

  /*
   * Different OCR engines may return different names.
   *
   * Supported:
   *
   * unit
   * units
   * Unit
   * UNIT
   * productUnit
   * product_unit
   * quantityUnit
   * quantity_unit
   * measure
   * measurement
   * uom
   * UOM
   */

  const possibleUnit =
    item.unit ??
    item.units ??
    item.Unit ??
    item.UNIT ??
    item.productUnit ??
    item.product_unit ??
    item.quantityUnit ??
    item.quantity_unit ??
    item.measure ??
    item.measurement ??
    item.uom ??
    item.UOM;

  return normalizeInventoryUnit(
    possibleUnit
  );
};


/* ============================================================
   UPLOAD INVOICE
   ============================================================ */

export const uploadInvoice = async imageUri => {

  const startTime =
    Date.now();

  try {

    /* ========================================================
       1. FETCH JWT TOKEN
       ======================================================== */

    const token =
      await AsyncStorage.getItem(
        'userToken'
      );


    /* ========================================================
       2. BUILD MULTIPART FORM
       ======================================================== */

    const form =
      new FormData();

    form.append(
      'file',
      {
        uri: imageUri,

        name:
          'invoice_scan.jpg',

        type:
          'image/jpeg',
      }
    );


    /* ========================================================
       3. SEND OCR REQUEST
       ======================================================== */

    const response =
      await fetch(
        `${BASE_URL}/api/v1/invoices/upload`,
        {
          method:
            'POST',

          body:
            form,

          headers:
            {
              Accept:
                'application/json',

              Authorization:
                `Bearer ${token}`,
            },
        }
      );


    /* ========================================================
       4. HANDLE SERVER ERROR
       ======================================================== */

    if (!response.ok) {

      const errData =
        await response
          .json()
          .catch(
            () => ({})
          );

      throw new Error(
        errData.error ||
        errData.message ||
        `Server Error: ${response.status}`
      );
    }


    /* ========================================================
       5. PARSE RESPONSE
       ======================================================== */

    const data =
      await response.json();


    const rawItems =
      data.extracted_data ||
      data.items ||
      [];


    /* ========================================================
       6. VALIDATE RESPONSE
       ======================================================== */

    if (
      !Array.isArray(
        rawItems
      )
    ) {

      throw new Error(
        'OCR server returned an invalid item list.'
      );
    }


    /* ========================================================
       7. SMART MAPPER
       ========================================================
       
       Supports:

       Gemini:
         productName
         purchasePrice
         sellingPrice
         unit

       Donut / ML:
         item_name
         purchase_price
         selling_price
         unit

       Other possible backend formats are also supported.
       ======================================================== */

    const formattedItems =
      rawItems.map(
        (item, index) => {

          /*
           * --------------------------------------------------
           * PRODUCT NAME
           * --------------------------------------------------
           */

          const name =
            item.productName ||
            item.item_name ||
            item.product_name ||
            item.name ||
            item.description ||
            `Scanned Item ${index + 1}`;


          /*
           * --------------------------------------------------
           * QUANTITY
           * --------------------------------------------------
           */

          let qty =
            Number(
              item.quantity ??
              item.qty ??
              item.Qty ??
              item.count ??
              1
            );

          if (
            !Number.isFinite(qty) ||
            qty <= 0
          ) {
            qty = 1;
          }


          /*
           * --------------------------------------------------
           * UNIT
           * --------------------------------------------------
           */

          const unit =
            extractUnit(
              item
            );


          /*
           * --------------------------------------------------
           * PURCHASE PRICE
           * --------------------------------------------------
           */

          const cost =
            Number(
              item.purchasePrice ??
              item.purchase_price ??
              item.costPrice ??
              item.cost_price ??
              item.buyPrice ??
              item.buy_price ??
              0
            );


          /*
           * --------------------------------------------------
           * SELLING PRICE
           * --------------------------------------------------
           */

          let sell =
            Number(
              item.sellingPrice ??
              item.selling_price ??
              item.sellPrice ??
              item.sell_price ??
              item.mrp ??
              0
            );


          /*
           * If AI did not provide selling price,
           * use existing 15% margin logic.
           */

          if (
            !Number.isFinite(sell) ||
            sell <= 0
          ) {

            if (
              Number.isFinite(
                cost
              ) &&
              cost > 0
            ) {

              sell =
                Math.round(
                  cost * 1.15
                );

            } else {

              sell = 0;
            }
          }


          /*
           * --------------------------------------------------
           * BARCODE
           * --------------------------------------------------
           */

          const itemBarcode =
            String(
              item.barcode ??
              item.bar_code ??
              item.Barcode ??
              ''
            ).trim();


          /*
           * --------------------------------------------------
           * RETURN NORMALIZED OBJECT
           * --------------------------------------------------
           */

          return {

            productName:
              String(
                name
              ).trim(),

            quantity:
              qty,

            unit:
              unit,

            purchasePrice:
              Number.isFinite(
                cost
              )
                ? cost
                : 0,

            sellingPrice:
              Number.isFinite(
                sell
              )
                ? sell
                : 0,

            barcode:
              itemBarcode,
          };
        }
      );


    /* ========================================================
       8. TELEMETRY
       ======================================================== */

    const latencyMs =
      Date.now() -
      startTime;


    TelemetryService.trackEvent(
      'ocr_scan_success',
      'ocr',
      {
        items_extracted:
          formattedItems.length,

        latency_ms:
          latencyMs,

        status:
          data.status ||
          'SUCCESS',
      }
    );


    /* ========================================================
       9. RETURN NORMALIZED DATA
       ======================================================== */

    return {
      extracted_data:
        formattedItems,
    };


  } catch (error) {

    /* ========================================================
       ERROR LOG
       ======================================================== */

    console.error(
      'OCR Pipeline Failed:',
      error.message
    );


    TelemetryService.logError(
      'ocr',
      error.message
    );


    /* ========================================================
       USER ERROR
       ======================================================== */

    Alert.alert(
      'Scanner Error',

      error.message.includes(
        'Server Error'
      )
        ? 'Could not reach the server or token expired. Please try again.'
        : `Scan Failed: ${error.message}`
    );


    return null;
  }
};


/* ============================================================
   OPTIONAL EXPORT
   ============================================================
   
   Exporting this is useful if you want to test unit
   normalization independently.
   ============================================================ */

export {
  normalizeInventoryUnit,
};