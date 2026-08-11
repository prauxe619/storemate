module.exports = {
  presets: ['module:@react-native/babel-preset'],
  env: {
    production: {
      // 🚀 STRIPS ALL CONSOLE LOGS IN RELEASE BUILDS
      plugins: ['transform-remove-console'],
    },
  },
};