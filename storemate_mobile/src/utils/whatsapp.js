import { Linking, Alert } from 'react-native';

/**
 * Sends a message using the native WhatsApp app.
 * This is free and does not require a Business API account.
 */
export const shareViaWhatsApp = (phone, message) => {
  // Ensure phone has country code (India is 91)
  const formattedPhone = phone.startsWith('91') ? phone : `91${phone}`;
  const url = `whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
  
  Linking.openURL(url).catch(() => {
    Alert.alert("Error", "WhatsApp is not installed on this device.");
  });
};