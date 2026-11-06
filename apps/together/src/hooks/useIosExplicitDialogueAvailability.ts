import { Platform } from 'react-native';

/** The iOS product never exposes explicit dialogue, including for a saved web preference. */
export function useIosExplicitDialogueAvailability(_visible: boolean): boolean {
  void _visible; // Retain the existing component-call signature.
  return Platform.OS !== 'ios';
}
