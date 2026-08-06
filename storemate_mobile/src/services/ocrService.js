import { Alert, Platform } from 'react-native';

// 🤖 10.0.2.2 directs the Android Emulator to your laptop's localhost
const BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:5050' : 'http://localhost:5050';

export const uploadInvoice = async (imageUri) => {
  try {
    const form = new FormData();
    form.append('file', {
      uri: imageUri,
      name: 'invoice_scan.jpg',
      type: 'image/jpeg',
    });

    const response = await fetch(`${BASE_URL}/api/v1/invoices/upload`, {
      method: 'POST',
      body: form,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Server Error: ${response.status}`);
    }

    const data = await response.json();
    const rawItems = data.extracted_data || data.items || [];

    // 🔄 Format keys for InventoryScreen.js review modal
    // 🔄 MAP AI OUTPUT TO UI FIELDS
    const formattedItems = rawItems.map(item => {
      const cost = Number(item.purchase_price) || 0;
      
      // 🧠 SMART LOGIC: If AI found a valid MRP, use it. 
      // If MRP is missing or 0, automatically calculate Cost + 15% Margin.
      let sell = Number(item.mrp);
      if (!sell || sell <= 0) {
        sell = Math.round(cost * 1.15); 
      }

      return {
        productName: item.item_name || 'Scanned Item',
        quantity: Number(item.quantity) || 1,
        purchasePrice: cost,
        sellingPrice: sell,
      };
    });

    return {
      extracted_data: formattedItems,
    };

  } catch (error) {
    console.error("OCR Pipeline Failed:", error.message);
    
    Alert.alert(
      "Scanner Error",
      "Could not reach the Flask server. Make sure 'python app.py' is running on port 5050."
    );
    
    return null; 
  }
};