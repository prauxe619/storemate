import { Linking, Alert } from 'react-native';

export const sendUdhariMessage = (customerName, phone, items, totalAmount) => {
  // items expected: [{productName: 'Maggi', qty: 2}, ...]
  const itemsText = items.map(i => `${i.productName} (Qty: ${i.qty})`).join(', ');
  
  const message = `Hello ${customerName}, your purchase summary from PRAUXE Atelier:\n\n` +
                  `Items: ${itemsText}\n\n` +
                  `Total Outstanding: ₹${totalAmount}\n\n` +
                  `Please clear your balance soon. Thank you!`;
  
  const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
  
  Linking.openURL(url).catch(() => {
    Alert.alert("Error", "WhatsApp is not installed on this device.");
  });
};