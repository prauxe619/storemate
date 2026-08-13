import axios from 'axios';

const BASE_URL = 'https://storemate-backend-production.up.railway.app';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
});

export const checkServerHealth = async () => {
  try {
    const response = await apiClient.get('/health');
    return response.data;
  } catch (error) {
    console.error(
      'Server is offline:',
      error?.response?.data || error.message
    );
    return null;
  }
};
