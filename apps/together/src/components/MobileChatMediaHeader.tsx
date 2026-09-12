import { styles } from '../styles/mobileChatMediaHeaderStyles';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { ArrowLeft, Camera, ChevronDown, Images, MapPin, MoreHorizontal, Phone } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { FrostedSurface } from './FrostedGlass';

type HeaderMode = 'hidden' | 'compact' | 'expanded';

type MobileChatMediaHeaderProps = {
  name: string;
  subtitle: string;
  portraitSource: ImageSource | number;
  compactIdentity?: ReactNode;
  profileAccessibilityLabel?: string;
  mediaSource?: ImageSource | number;
  hasMedia?: boolean;
  onBack: () => void;
  onProfile: () => void;
  onPhoto: () => void;
  onCall?: () => void;
  onPlace?: () => void;
  placeName?: string;
  onMenu: () => void;
  onMedia?: () => void;
  onFeaturedMedia?: () => void;
  mediaCount?: number;
};

export function MobileChatMediaHeader({
  name,
  subtitle,
  portraitSource,
  compactIdentity,
  profileAccessibilityLabel,
  mediaSource,
  hasMedia = false,
  onBack,
  onProfile,
  onPhoto,
  onCall,
  onPlace,
  placeName,
  onMenu,
  onMedia,
  onFeaturedMedia,
  mediaCount,
}: MobileChatMediaHeaderProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 10 : Math.max(insets.top, 24);
  const compactHeight = topInset + 62;
  const expandedHeight = Math.min(430, Math.max(350, width * .9, topInset + 300));
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
  const profileLabel = profileAccessibilityLabel ?? `View ${name}'s profile`;
  const showMediaAction=mediaCount!==undefined&&Boolean(onMedia);
  const placeActionTop=topInset+(onCall?186:132);

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
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Messages" hitSlop={10} onPress={onBack} style={[styles.action, styles.back, { top: actionTop }]}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>

        <Animated.View style={[styles.compactIdentity, { top: actionTop, opacity: compactOpacity }]} pointerEvents={mode === 'compact' ? 'auto' : 'none'}>
          <Pressable accessibilityRole="button" accessibilityLabel={profileLabel} onPress={onProfile} style={[styles.compactPortraitButton, compactIdentity ? styles.compactGroupIdentity : undefined]}>
            {compactIdentity ?? <Image source={portraitSource} style={styles.compactPortrait} contentFit="cover" contentPosition="top" transition={160} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={profileLabel} onPress={onProfile} style={styles.copy}>
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
            onPress={hasMedia ? onFeaturedMedia??onMedia??onProfile : onProfile}
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
          <Pressable accessibilityRole="button" accessibilityLabel={`Ask ${name} for a photo`} onPress={onPhoto} style={styles.actionPressable}>
            <Camera size={19} color={colors.text} />
          </Pressable>
        </Animated.View>
        {onCall?<Animated.View style={[styles.action, animatedActionStyle(62, topInset + 78)]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Call ${name}`} onPress={onCall} style={styles.actionPressable}>
            <Phone size={18} color={colors.text} />
          </Pressable>
        </Animated.View>:null}
        {onPlace?<Animated.View
          pointerEvents={mode === 'expanded' ? 'auto' : 'none'}
          style={[styles.action,styles.expandedPlaceAction,{top:placeActionTop,opacity:expandedOpacity}]}
        >
          <Pressable accessibilityRole="button" accessibilityLabel={`About ${placeName??subtitle}`} onPress={onPlace} style={styles.actionPressable}>
            <MapPin size={18} color={colors.warm}/>
          </Pressable>
        </Animated.View>:null}
        {showMediaAction?<Animated.View
          pointerEvents={mode === 'expanded' ? 'auto' : 'none'}
          style={[styles.action,styles.expandedPlaceAction,{top:placeActionTop+(onPlace?54:0),opacity:expandedOpacity}]}
        >
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name} conversation media${mediaCount?`, ${mediaCount} items`:''}`} onPress={onMedia} style={styles.actionPressable}>
            <Images size={18} color={colors.violet}/>
            {mediaCount?<View style={styles.mediaCount}><Text style={styles.mediaCountText}>{mediaCount>99?'99+':mediaCount}</Text></View>:null}
          </Pressable>
        </Animated.View>:null}
        <Animated.View style={[styles.action, animatedActionStyle(12, topInset + 24)]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Conversation menu" onPress={onMenu} style={styles.actionPressable}>
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
