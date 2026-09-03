import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { colors } from '../theme';
import { shouldShowRouteTransition } from '../lib/conversationNavigation';
import { completePendingWebRouteTransition } from '../lib/appNavigation';

export function RouteTransitionVeil() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // The shared web navigator stores its destination before changing history.
    // Clear that cover only when this route has actually mounted.
    completePendingWebRouteTransition(pathname);
    if (!shouldShowRouteTransition(previous.current, pathname)) {
      previous.current = pathname;
      return;
    }
    previous.current = pathname;
    opacity.stopAnimation();
    opacity.setValue(.14);
    Animated.timing(opacity,{toValue:0,duration:170,useNativeDriver:Platform.OS!=='web'}).start();
  }, [opacity, pathname]);
  return <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.veil,{opacity}]}/>;
}

const styles=StyleSheet.create({veil:{...StyleSheet.absoluteFill,zIndex:900,backgroundColor:colors.background}});
