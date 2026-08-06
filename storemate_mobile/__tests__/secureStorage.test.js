// __tests__/secureStorage.test.js
import { SecureStorage } from '../src/utils/secureStorage';

describe('Phase 2: Secure Token Storage Security Check', () => {
  
  beforeEach(async () => {
    await SecureStorage.removeToken();
  });

  it('safely stores and retrieves the JWT token', async () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-shop-owner-token';
    
    // 1. Save token securely
    await SecureStorage.setToken(fakeToken);
    
    // 2. Retrieve token
    const retrievedToken = await SecureStorage.getToken();
    
    // 3. Verify it matches
    expect(retrievedToken).toBe(fakeToken);
  });

  it('completely deletes the token upon logout', async () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-shop-owner-token';
    
    await SecureStorage.setToken(fakeToken);
    expect(await SecureStorage.getToken()).toBe(fakeToken);
    
    // Simulate user logging out
    await SecureStorage.removeToken();
    
    const clearedToken = await SecureStorage.getToken();
    expect(clearedToken).toBeNull();
  });
});