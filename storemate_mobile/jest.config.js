module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-native-community|@react-native-async-storage|@react-navigation|react-native-safe-area-context|react-native-screens)/)',
  ],
};