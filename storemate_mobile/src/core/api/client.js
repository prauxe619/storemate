import axios from 'axios';
import { Platform } from 'react-native';

const BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:5050' : 'http://localhost:5050';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 60000, 
  // ✅ Removed the hardcoded headers so Axios can auto-generate boundaries!
});

export const checkServerHealth = async () => {
  try {
    const response = await apiClient.get('/health');
    return response.data;
  } catch (error) {
    console.error("Server is offline:", error.message);
    return null;
  }
};