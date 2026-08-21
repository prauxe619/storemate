import {
  NativeModules,
  NativeEventEmitter,
  PermissionsAndroid,
  Platform,
} from 'react-native';

const { StoreMateSpeech } = NativeModules;

const canUseNativeSpeech =
  Platform.OS === 'android' &&
  StoreMateSpeech &&
  typeof StoreMateSpeech.startListening === 'function' &&
  typeof StoreMateSpeech.stopListening === 'function';

const speechEmitter =
  canUseNativeSpeech &&
  typeof StoreMateSpeech.addListener === 'function' &&
  typeof StoreMateSpeech.removeListeners === 'function'
    ? new NativeEventEmitter(StoreMateSpeech)
    : null;

const noopSubscription = {
  remove() {},
};

export const SpeechEngine = {
  async requestPermission() {
    if (Platform.OS !== 'android') {
      return false;
    }

    const granted =
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );

    return (
      granted ===
      PermissionsAndroid.RESULTS.GRANTED
    );
  },

  async start() {
    const hasPermission =
      await this.requestPermission();

    if (!hasPermission) {
      throw new Error(
        'Microphone permission denied'
      );
    }

    if (!canUseNativeSpeech) {
      throw new Error(
        'Native speech module is unavailable'
      );
    }

    return StoreMateSpeech.startListening();
  },

  async stop() {
    if (!canUseNativeSpeech) {
      return null;
    }

    try {
      return await StoreMateSpeech.stopListening();
    } catch (error) {
      return null;
    }
  },

  onPartialResult(callback) {
    if (
      !speechEmitter ||
      typeof callback !== 'function'
    ) {
      return noopSubscription;
    }

    return speechEmitter.addListener(
      'onSpeechPartial',
      event => {
        try {
          callback(
            typeof event?.text === 'string'
              ? event.text
              : ''
          );
        } catch (error) {
          console.warn(
            'SpeechEngine partial callback error:',
            error?.message || error
          );
        }
      }
    );
  },

  onFinalResult(callback) {
    if (
      !speechEmitter ||
      typeof callback !== 'function'
    ) {
      return noopSubscription;
    }

    return speechEmitter.addListener(
      'onSpeechFinal',
      event => {
        try {
          callback(
            typeof event?.text === 'string'
              ? event.text
              : ''
          );
        } catch (error) {
          console.warn(
            'SpeechEngine final callback error:',
            error?.message || error
          );
        }
      }
    );
  },

  onError(callback) {
    if (
      !speechEmitter ||
      typeof callback !== 'function'
    ) {
      return noopSubscription;
    }

    return speechEmitter.addListener(
      'onSpeechError',
      event => {
        try {
          callback(
            event?.code ?? 'UNKNOWN'
          );
        } catch (error) {
          console.warn(
            'SpeechEngine error callback error:',
            error?.message || error
          );
        }
      }
    );
  },
};

export default SpeechEngine;