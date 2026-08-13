import { Platform } from 'react-native';

// 🌐 Your Laptop's local Wi-Fi IP address (for Physical Device)
const LOCAL_WIFI_IP = '192.168.31.65'; 

// 📱 Default fallback URL
export const BASE_URL = `http://${LOCAL_WIFI_IP}:5050`;

export const API_BASE_URL =
  'https://storemate-backend-production.up.railway.app';
