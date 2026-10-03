import { Platform } from 'react-native';

/** A platform hint for product policy; unknown clients remain fail-closed. */
export function nativePlatformHeaders(): Record<string, string> {
  return Platform.OS === 'ios' || Platform.OS === 'android'
    ? { 'x-kivelli-client-platform': Platform.OS }
    : {};
}
