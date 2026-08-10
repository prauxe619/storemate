import { Linking } from 'react-native';

export const sendWhatsAppReceipt = async (customerPhone, amount, customerName) => {
    // The exact growth-hack message format[cite: 5]
    const message = `Hello ${customerName}, here is your latest bill for ₹${amount} from our store.\n\n` + 
                    `---\n` +
                    `Sent via StoreMate — The Free AI Operating System for Shops. Click here to digitize your store: https://storemate.in/app`; 

    // Format phone number to E.164 (remove + if present, ensure country code)
    const formattedPhone = customerPhone.replace('+', '');
    const url = `whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;

    try {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
            await Linking.openURL(url);
        } else {
            alert("WhatsApp is not installed on this device.");
        }
    } catch (error) {
        console.error("Error opening WhatsApp:", error);
    }
};