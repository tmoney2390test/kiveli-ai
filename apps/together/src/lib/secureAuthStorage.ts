import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createChunkedSecureStorage } from './secureAuthStorageCore';

export const nativeAuthStorage = createChunkedSecureStorage(
  {
    getItemAsync: (key) => SecureStore.getItemAsync(key),
    setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
    deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
  },
  AsyncStorage,
);
