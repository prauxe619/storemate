import { NativeModules, NativeEventEmitter, PermissionsAndroid, Platform } from 'react-native';

const { StoreMateSpeech } = NativeModules;
const speechEmitter = new NativeEventEmitter(StoreMateSpeech);

export const SpeechEngine = {
  async requestPermission() {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return false;
  },

  async start() {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) throw new Error('Microphone permission denied');
    return await StoreMateSpeech.startListening();
  },

  async stop() {
    return await StoreMateSpeech.stopListening();
  },

  onPartialResult(callback) {
    return speechEmitter.addListener('onSpeechPartial', (event) => callback(event.text));
  },

  onFinalResult(callback) {
    return speechEmitter.addListener('onSpeechFinal', (event) => callback(event.text));
  },

  onError(callback) {
    return speechEmitter.addListener('onSpeechError', (event) => callback(event.code));
  }
};