import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Brain, Check, Copy } from 'lucide-react-native';
import { colors, radius } from '../theme';
import { FrostedSurface } from './FrostedGlass';

type MemorySavedToastProps = {
  name: string;
  onDismiss: () => void;
  onView?: () => void;
  bottomOffset?: number;
};

function TimedToast({ label, onDismiss, onPress, bottomOffset=82, duration=2400, children }: {label:string;onDismiss:()=>void;onPress:()=>void;bottomOffset?:number;duration?:number;children:ReactNode}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: false }),
      Animated.spring(translateY, { toValue: 0, speed: 24, bounciness: 4, useNativeDriver: false }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 170, useNativeDriver: false }),
        Animated.timing(translateY, { toValue: 5, duration: 170, useNativeDriver: false }),
      ]).start(({ finished }) => {
        if (finished) dismissRef.current();
      });
    }, duration);

    return () => {
      clearTimeout(timer);
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [duration, opacity, translateY]);

  return (
    <View pointerEvents="box-none" style={[styles.positioner,{bottom:bottomOffset}]}>
      <Animated.View style={{ opacity, transform: [{ translateY }] }}>
        <Pressable
          accessibilityLiveRegion="polite"
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
        >
          <FrostedSurface intensity={88} style={styles.toast}>
            {children}
          </FrostedSurface>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function MemorySavedToast({ name, onDismiss, onView, bottomOffset }: MemorySavedToastProps) {
  const firstName = name.trim().split(/\s+/)[0] || 'Your companion';
  return <TimedToast label={`${firstName} will remember this. View in Memory Center`} onDismiss={onDismiss} onPress={onView??onDismiss} bottomOffset={bottomOffset}>
    <View style={styles.icon}><Brain size={17} color={colors.rose}/><View style={styles.check}><Check size={8} strokeWidth={3} color="#FFFFFF"/></View></View>
    <Text style={styles.text}>{firstName} will remember this · View</Text>
  </TimedToast>;
}

export function CopyToast({ onDismiss, bottomOffset }: {onDismiss:()=>void;bottomOffset?:number}) {
  return <TimedToast label="Copied to clipboard" onDismiss={onDismiss} onPress={onDismiss} bottomOffset={bottomOffset} duration={1600}>
    <View style={styles.icon}><Copy size={17} color={colors.rose}/></View>
    <Text style={styles.text}>Copied to clipboard</Text>
  </TimedToast>;
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
    elevation: 30,
    alignItems: 'center',
  },
  toast: {
    minHeight: 48,
    maxWidth: 360,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(26,17,37,.82)',
    borderColor: 'rgba(216,62,234,.30)',
    shadowColor: '#000000',
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(216,62,234,.12)',
  },
  check: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.rose,
    borderWidth: 1.5,
    borderColor: 'rgba(26,17,37,.96)',
  },
  text: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
});
