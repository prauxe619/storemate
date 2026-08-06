const storage = {};

const EncryptedStorage = {
  setItem: jest.fn(async (key, value) => {
    storage[key] = value;
    return Promise.resolve();
  }),
  getItem: jest.fn(async (key) => {
    return Promise.resolve(storage[key] ?? null);
  }),
  removeItem: jest.fn(async (key) => {
    delete storage[key];
    return Promise.resolve();
  }),
  clear: jest.fn(async () => {
    Object.keys(storage).forEach((key) => delete storage[key]);
    return Promise.resolve();
  }),
};

export default EncryptedStorage;