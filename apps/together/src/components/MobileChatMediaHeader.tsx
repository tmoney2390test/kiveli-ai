import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { ArrowLeft, Camera, ChevronDown, MoreHorizontal, Phone } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { FrostedSurface } from './FrostedGlass';

type HeaderMode = 'hidden' | 'compact' | 'expanded';

type MobileChatMediaHeaderProps = {
  name: string;
  subtitle: string;
  portraitSource: ImageSource | number;
  mediaSource?: ImageSource | number;
  hasMedia?: boolean;
  onBack: () => void;
  onProfile: () => void;
  onPhoto: () => void;
  onCall?: () => void;
  onMenu: () => void;
  onMedia?: () => void;
};

const ACTION_SIZE = 44;

export function MobileChatMediaHeader({
  name,
  subtitle,
  portraitSource,
  mediaSource,
  hasMedia = false,
  onBack,
  onProfile,
  onPhoto,
  onCall,
  onMenu,
  onMedia,
}: MobileChatMediaHeaderProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 10 : Math.max(insets.top, 24);
  const compactHeight = topInset + 62;
  const expandedHeight = Math.min(410, Math.max(330, width * .9));
  const [mode, setMode] = useState<HeaderMode>('compact');
  const progress = useRef(new Animated.Value(0)).current;
  const modeRef = useRef<HeaderMode>('compact');
  const gestureStart = useRef(0);

  const transitionTo = useCallback((next: HeaderMode) => {
    modeRef.current = next;
    setMode(next);
    Animated.spring(progress, {
      toValue: next === 'hidden' ? -1 : next === 'expanded' ? 1 : 0,
      damping: 24,
      stiffness: 230,
      mass: .82,
      overshootClamping: true,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    modeRef.current = 'compact';
    setMode('compact');
    progress.setValue(0);
  }, [name, progress]);

  const wantsVerticalGesture = (_event: unknown, gesture: { dx: number; dy: number }) =>
    Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.15;
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: wantsVerticalGesture,
    // Keep header buttons responsive even when a tap includes a little motion.
    // A deliberate drag can still be claimed through the bubbling responder.
    onMoveShouldSetPanResponderCapture: () => false,
    onPanResponderGrant: () => {
      gestureStart.current = modeRef.current === 'expanded' ? 1 : 0;
      progress.stopAnimation();
    },
    onPanResponderMove: (_event, gesture) => {
      const start = gestureStart.current;
      if (start >= 1) {
        progress.setValue(Math.max(-1, Math.min(1, 1 + gesture.dy / Math.max(1, expandedHeight - compactHeight))));
        return;
      }
      const next = gesture.dy >= 0
        ? gesture.dy / Math.max(1, expandedHeight - compactHeight)
        : gesture.dy / Math.max(1, compactHeight);
      progress.setValue(Math.max(-1, Math.min(1, next)));
    },
    onPanResponderRelease: (_event, gesture) => {
      const startedExpanded = gestureStart.current >= 1;
      if ((!startedExpanded && (gesture.dy <= -42 || gesture.vy <= -.75)) ||
          (startedExpanded && (gesture.dy <= -150 || gesture.vy <= -1.65))) {
        transitionTo('hidden');
        return;
      }
      if (startedExpanded && (gesture.dy <= -22 || gesture.vy <= -.45)) {
        transitionTo('compact');
        return;
      }
      if (!startedExpanded && (gesture.dy >= 24 || gesture.vy >= .45)) {
        transitionTo('expanded');
        return;
      }
      transitionTo(startedExpanded ? 'expanded' : 'compact');
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderTerminate: () => transitionTo(gestureStart.current >= 1 ? 'expanded' : 'compact'),
  }), [compactHeight, expandedHeight, progress, transitionTo]);

  const height = progress.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [0, compactHeight, expandedHeight],
  });
  const headerOpacity = progress.interpolate({
    inputRange: [-1, -.72, 0],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });
  const compactOpacity = progress.interpolate({
    inputRange: [0, .58, 1],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });
  const expandedOpacity = progress.interpolate({
    inputRange: [0, .35, 1],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });
  const expandedScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [.92, 1],
    extrapolate: 'clamp',
  });
  const actionProgress = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const actionTop = topInset + 5;
  const animatedActionStyle = (compactRight: number, expandedTop: number) => ({
    top: actionProgress.interpolate({ inputRange: [0, 1], outputRange: [actionTop, expandedTop] }),
    right: actionProgress.interpolate({ inputRange: [0, 1], outputRange: [compactRight, 12] }),
  });
  const image = mediaSource ?? portraitSource;

  if (mode === 'hidden') {
    return <View pointerEvents="box-none" style={styles.hiddenShell}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show conversation header"
        onPress={() => transitionTo('compact')}
        style={[styles.restore, { top: topInset + 7 }]}
      >
        <ChevronDown size={18} color="#E8DDF3" />
      </Pressable>
    </View>;
  }

  return <Animated.View style={[styles.shell, { height }]} {...panResponder.panHandlers}>
    <FrostedSurface intensity={88} style={styles.glass}>
      <Animated.View pointerEvents="none" style={[styles.purpleWash, { opacity: headerOpacity }]} />

      <Animated.View style={[styles.headerContents, { opacity: headerOpacity }]}>
        <Pressable accessibilityLabel="Back to Messages" hitSlop={10} onPress={onBack} style={[styles.action, styles.back, { top: actionTop }]}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>

        <Animated.View style={[styles.compactIdentity, { top: actionTop, opacity: compactOpacity }]} pointerEvents={mode === 'compact' ? 'auto' : 'none'}>
          <Pressable accessibilityLabel={`View ${name}'s profile`} onPress={onProfile} style={styles.compactPortraitButton}>
            <Image source={portraitSource} style={styles.compactPortrait} contentFit="cover" contentPosition="top" transition={160} />
          </Pressable>
          <Pressable onPress={onProfile} style={styles.copy}>
            <Text numberOfLines={1} style={styles.name}>{name}</Text>
            <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
          </Pressable>
        </Animated.View>

        <Animated.View
          pointerEvents={mode === 'expanded' ? 'auto' : 'none'}
          style={[styles.expandedMediaWrap, {
            top: topInset + 11,
            bottom: 30,
            opacity: expandedOpacity,
            transform: [{ scale: expandedScale }],
          }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hasMedia ? `Open the latest photo from ${name}` : `View ${name}'s profile`}
            onPress={hasMedia ? onMedia : onProfile}
            style={styles.expandedMediaButton}
          >
            <Image source={image} style={styles.expandedMedia} contentFit="cover" contentPosition="top" transition={180} />
            <View pointerEvents="none" style={styles.mediaShade} />
            <View pointerEvents="none" style={styles.mediaLabel}>
              <Text numberOfLines={1} style={styles.mediaName}>{name}</Text>
              <Text style={styles.mediaMeta}>{hasMedia ? 'LATEST PHOTO' : 'PROFILE'}</Text>
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.action, animatedActionStyle(onCall ? 112 : 62, topInset + (onCall ? 132 : 78))]}>
          <Pressable accessibilityLabel={`Ask ${name} for a photo`} onPress={onPhoto} style={styles.actionPressable}>
            <Camera size={19} color={colors.text} />
          </Pressable>
        </Animated.View>
        {onCall?<Animated.View style={[styles.action, animatedActionStyle(62, topInset + 78)]}>
          <Pressable accessibilityLabel={`Call ${name}`} onPress={onCall} style={styles.actionPressable}>
            <Phone size={18} color={colors.text} />
          </Pressable>
        </Animated.View>:null}
        <Animated.View style={[styles.action, animatedActionStyle(12, topInset + 24)]}>
          <Pressable accessibilityLabel="Conversation menu" onPress={onMenu} style={styles.actionPressable}>
            <MoreHorizontal size={21} color={colors.text} />
          </Pressable>
        </Animated.View>
      </Animated.View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mode === 'expanded' ? 'Collapse conversation header' : 'Expand conversation header'}
        onPress={() => transitionTo(mode === 'expanded' ? 'compact' : 'expanded')}
        hitSlop={10}
        style={styles.handleButton}
      >
        <View style={styles.handle} />
      </Pressable>
    </FrostedSurface>
  </Animated.View>;
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    zIndex: 18,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none' } as never) : {}),
  },
  glass: {
    flex: 1,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    borderBottomColor: 'rgba(210,172,255,.22)',
    backgroundColor: 'rgba(12,10,20,.72)',
    shadowColor: '#9F62E8',
    shadowOpacity: .16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 9 },
  },
  purpleWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(79,39,112,.11)',
  },
  headerContents: {
    ...StyleSheet.absoluteFill,
  },
  back: {
    position: 'absolute',
    left: 8,
  },
  compactIdentity: {
    position: 'absolute',
    left: 54,
    right: 162,
    height: ACTION_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  compactPortraitButton: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.17)',
  },
  compactPortrait: {
    width: '100%',
    height: '100%',
  },
  copy: {
    minWidth: 0,
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  action: {
    position: 'absolute',
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,.075)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.11)',
    shadowColor: '#000',
    shadowOpacity: .22,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
  },
  actionPressable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ACTION_SIZE / 2,
  },
  expandedMediaWrap: {
    position: 'absolute',
    left: 58,
    right: 70,
  },
  expandedMediaButton: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.17)',
    backgroundColor: 'rgba(255,255,255,.04)',
  },
  expandedMedia: {
    width: '100%',
    height: '100%',
  },
  mediaShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8,5,13,.08)',
  },
  mediaLabel: {
    position: 'absolute',
    left: 13,
    right: 13,
    bottom: 11,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 13,
    backgroundColor: 'rgba(10,7,17,.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.1)',
  },
  mediaName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  mediaMeta: {
    color: 'rgba(255,255,255,.65)',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  handleButton: {
    position: 'absolute',
    bottom: 0,
    left: '38%',
    right: '38%',
    height: 25,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 7,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(232,214,255,.58)',
  },
  hiddenShell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 18,
    overflow: 'visible',
  },
  restore: {
    position: 'absolute',
    right: 11,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,20,40,.84)',
    borderWidth: 1,
    borderColor: 'rgba(225,195,255,.18)',
    shadowColor: '#000',
    shadowOpacity: .32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
