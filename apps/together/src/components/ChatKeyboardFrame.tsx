import { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, KeyboardAvoidingView, Platform, View, type KeyboardEvent, type StyleProp, type ViewStyle } from 'react-native';
import { nativeChatKeyboardInset, visibleKeyboardTop } from '../lib/nativeChatKeyboard';

export function ChatKeyboardFrame({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const frameRef = useRef<View>(null);
  const keyboardTop = useRef<number | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [bottomInset, setBottomInset] = useState(0);

  const measureOverlap = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    const top = keyboardTop.current;
    if (top === null) { setBottomInset(0); return; }
    frameRef.current?.measureInWindow((_x, y, _width, height) => {
      if (height < 100) return;
      const inset = nativeChatKeyboardInset(y + height, keyboardTop.current);
      setBottomInset((current) => Math.abs(current - inset) < 2 ? current : inset);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const scheduleMeasure = () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
      for (const delay of [0, 60, 180, 360]) {
        const timer = setTimeout(() => { timers.current.delete(timer); measureOverlap(); }, delay);
        timers.current.add(timer);
      }
    };
    const show = (event: KeyboardEvent) => {
      keyboardTop.current = visibleKeyboardTop(event.endCoordinates.screenY, event.endCoordinates.height, Dimensions.get('screen').height);
      scheduleMeasure();
    };
    const hide = () => { keyboardTop.current = null; setBottomInset(0); };
    const subscriptions = [
      Keyboard.addListener('keyboardWillShow', show),
      Keyboard.addListener('keyboardDidShow', show),
      Keyboard.addListener('keyboardWillChangeFrame', show),
      Keyboard.addListener('keyboardWillHide', hide),
      Keyboard.addListener('keyboardDidHide', hide),
    ];
    const current = Keyboard.metrics();
    if (current) {
      keyboardTop.current = visibleKeyboardTop(current.screenY, current.height, Dimensions.get('screen').height);
      scheduleMeasure();
    }
    return () => { subscriptions.forEach((subscription) => subscription.remove()); for (const timer of timers.current) clearTimeout(timer); timers.current.clear(); };
  }, [measureOverlap]);

  if (Platform.OS === 'android') return <KeyboardAvoidingView style={style} behavior="height">{children}</KeyboardAvoidingView>;
  return <View ref={frameRef} style={[style, Platform.OS === 'ios' && bottomInset > 0 ? { paddingBottom: bottomInset } : null]} onLayout={measureOverlap}>{children}</View>;
}
