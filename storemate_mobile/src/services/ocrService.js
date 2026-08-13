import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../config/api';
import TelemetryService from './TelemetryService'; // Ensure path matches your project structure

export const uploadInvoice = async (imageUri) => {
  const startTime = Date.now();

  try {
    // 🚀 1. Fetch JWT token for backend authentication
    const token = await AsyncStorage.getItem('userToken');

    const form = new FormData();
    form.append('file', {
      uri: imageUri,
      name: 'invoice_scan.jpg',
      type: 'image/jpeg',
    });

    // 🚀 2. Send upload request with Bearer JWT Token
    const response = await fetch(`${BASE_URL}/api/v1/invoices/upload`, {
      method: 'POST',
      body: form,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`, // Required by @jwt_required() on backend
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server Error: ${response.status}`);
    }

    const data = await response.json();
    const rawItems = data.extracted_data || data.items || [];

    // 🔄 3. SMART MAPPER: Supports Gemini (camelCase) & Donut ML Fallback (snake_case)
    const formattedItems = rawItems.map(item => {
      const name = item.productName || item.item_name || 'Scanned Item';
      const qty = Number(item.quantity) || 1;
      const cost = Number(item.purchasePrice ?? item.purchase_price) || 0;
      
      // Use AI selling price if provided; otherwise default to Cost + 15% margin
      let sell = Number(item.sellingPrice ?? item.selling_price ?? item.mrp);
      if (!sell || sell <= 0) {
        sell = Math.round(cost * 1.15); 
      }

      return {
        productName: name,
        quantity: qty,
        purchasePrice: cost,
        sellingPrice: sell,
      };
    });

    // 📊 4. Telemetry: Log successful scan to Admin Dashboard
    const latencyMs = Date.now() - startTime;
    TelemetryService.trackEvent('ocr_scan_success', 'ocr', {
      items_extracted: formattedItems.length,
      latency_ms: latencyMs,
      status: data.status || 'SUCCESS'
    });

    return {
      extracted_data: formattedItems,
    };

  } catch (error) {
    console.error("OCR Pipeline Failed:", error.message);
    
    // 📊 Telemetry: Log error event to Admin Error Center
    TelemetryService.logError('ocr', error.message);

    Alert.alert(
      "Scanner Error",
      error.message.includes('Server Error')
        ? "Could not reach the server or token expired. Please try again."
        : `Scan Failed: ${error.message}`
    );
    
    return null; 
  }
};