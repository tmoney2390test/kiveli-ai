import { Alert, Platform } from 'react-native';

export function confirmAction(options: { title: string; message: string; confirmLabel: string; destructive?: boolean; onConfirm: () => void | Promise<void> }): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${options.title}\n\n${options.message}`)) void options.onConfirm();
    return;
  }
  Alert.alert(options.title, options.message, [
    { text: 'Cancel', style: 'cancel' },
    { text: options.confirmLabel, style: options.destructive ? 'destructive' : 'default', onPress: () => void options.onConfirm() },
  ]);
}

export function promptText(options: { title: string; message?: string; initialValue?: string; onSubmit: (value: string) => void | Promise<void> }): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const value = window.prompt([options.title, options.message].filter(Boolean).join('\n\n'), options.initialValue ?? '');
    if (value?.trim()) void options.onSubmit(value.trim());
    return;
  }
  Alert.prompt?.(options.title, options.message, (value) => { if (value?.trim()) void options.onSubmit(value.trim()); }, 'plain-text', options.initialValue);
}
