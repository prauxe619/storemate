// src/utils/secureStorage.js
import EncryptedStorage from 'react-native-encrypted-storage';

export const SecureStorage = {
  async setToken(token) {
    try {
      await EncryptedStorage.setItem('userToken', token);
    } catch (error) {
      console.error('Failed to save secure token', error);
    }
  },

  async getToken() {
    try {
      const token = await EncryptedStorage.getItem('userToken');
      return token;
    } catch (error) {
      console.error('Failed to retrieve secure token', error);
      return null;
    }
  },

  async removeToken() {
    try {
      await EncryptedStorage.removeItem('userToken');
    } catch (error) {
      console.error('Failed to remove secure token', error);
    }
  }
};