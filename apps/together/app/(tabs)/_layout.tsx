import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Compass, Home, Images, MessageCircle, Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppShell } from '../../src/shell/AppShellContext';
import { MobileTabButton } from '../../src/shell/MobileTabButton';
import { IosLiquidGlass, supportsIosLiquidGlass } from '../../src/shell/IosLiquidGlass';
import { CreateMenu } from '../../src/components/CreateMenu';
import { MESSAGES_INBOX_HREF, mostRecentChatHref, WEB_MESSAGES_INBOX_HREF } from '../../src/lib/messageInbox';
import { useTogether } from '../../src/store/useTogether';
import { colors } from '../../src/theme';
import { markRouteIntent, scheduleCoreRouteWarmup, warmRoute } from '../../src/lib/routeWarmup';
import { isDesktopShellViewport } from '../../src/lib/desktopNavigation';

const web = Platform.OS === 'web';

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const insets=useSafeAreaInsets();
  const { desktop } = useAppShell();
  const desktopViewport=isDesktopShellViewport(Platform.OS,width);
  const snapshot=useTogether((state)=>state.snapshot);
  const webBarWidth = Math.max(300, Math.min(720, width - 24));
  const iosGlass = supportsIosLiquidGlass();
  const latestChatHref=snapshot?mostRecentChatHref(snapshot.conversations,snapshot.characters):null;
  const messagesInboxHref=web?WEB_MESSAGES_INBOX_HREF:MESSAGES_INBOX_HREF;
  const[webInputFocused,setWebInputFocused]=useState(false);
  const[createOpen,setCreateOpen]=useState(false);
  useEffect(()=>snapshot?scheduleCoreRouteWarmup((href)=>router.prefetch(href as never)):undefined,[Boolean(snapshot)]);
  useEffect(()=>{
    if(!web)return;
    const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.isContentEditable);
    const handleFocusIn=(event:FocusEvent)=>setWebInputFocused(editable(event.target));
    const handleFocusOut=()=>requestAnimationFrame(()=>setWebInputFocused(editable(document.activeElement)));
    document.addEventListener('focusin',handleFocusIn,true);document.addEventListener('focusout',handleFocusOut,true);
    return()=>{document.removeEventListener('focusin',handleFocusIn,true);document.removeEventListener('focusout',handleFocusOut,true);};
  },[]);
  const prepare=(href:string)=>{markRouteIntent(href);warmRoute(href,(value)=>router.prefetch(value as never));};
  return <><Tabs screenOptions={{
    headerShown: false,
    sceneStyle: { backgroundColor: colors.background, ...(web ? ({ minHeight: '100dvh' } as never) : {}) },
    tabBarActiveTintColor: Platform.OS === 'ios' ? '#FFF1F8' : '#FF86AB',
    tabBarInactiveTintColor: '#938996',
    tabBarActiveBackgroundColor: 'transparent',
    tabBarButton: (props) => <MobileTabButton {...props} />,
    tabBarHideOnKeyboard: true,
    tabBarBackground: () => <FrostedTabBarBackground liquidGlass={iosGlass} />,
    tabBarStyle: {
      display: desktop||desktopViewport||webInputFocused ? 'none' : 'flex',
      position: 'absolute',
      zIndex: 100,
      left: Platform.OS === 'ios' ? 14 : 8,
      right: Platform.OS === 'ios' ? 14 : 8,
      bottom: Math.max(8,insets.bottom),
      height: Platform.OS === 'ios' ? 68 : 72,
      paddingTop: Platform.OS === 'ios' ? 3 : 5,
      paddingBottom: Platform.OS === 'ios' ? 3 : 7,
      backgroundColor: 'transparent',
      borderTopWidth: 1,
      borderWidth: 1,
      borderColor: iosGlass ? 'rgba(255,248,244,.2)' : 'rgba(255,248,244,.11)',
      borderRadius: Platform.OS === 'ios' ? 34 : 20,
      borderCurve: 'continuous',
      elevation: 18,
      shadowColor: '#000',
      shadowOpacity: Platform.OS === 'ios' ? .36 : .45,
      shadowRadius: Platform.OS === 'ios' ? 22 : 26,
      shadowOffset: { width: 0, height: Platform.OS === 'ios' ? 8 : 13 },
      overflow: 'hidden',
      ...(web ? { position: 'fixed' as never, width: webBarWidth, left: '50%', right: undefined, marginLeft: -webBarWidth / 2, bottom: 'max(8px, env(safe-area-inset-bottom))' as never, backdropFilter: 'blur(30px) saturate(145%)' } : {}),
    },
    tabBarItemStyle: { minHeight: Platform.OS === 'ios' ? 56 : 52, borderRadius: Platform.OS === 'ios' ? 26 : 16, marginHorizontal: Platform.OS === 'ios' ? 2 : 5, marginVertical: 3 },
    tabBarLabelStyle: { fontSize: Platform.OS === 'ios' ? 10 : 9, lineHeight: 14, flexShrink: 0, fontWeight: '800', letterSpacing: .12 },
  }}>
    <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size, focused }) => <Home color={color} size={focused ? size + 1 : size} fill={focused ? 'rgba(239,82,137,.13)' : 'transparent'} /> }} listeners={{tabPress:()=>prepare('/home')}} />
    <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: ({ color, size, focused }) => <Compass color={color} size={focused ? size + 2 : size} /> }} listeners={{tabPress:()=>prepare('/explore')}} />
    <Tabs.Screen
      name="chat-tab"
      options={{ title: 'Chat', tabBarIcon: ({ color, size, focused }) => <MessageCircle color={color} size={focused ? size + 2 : size} fill={focused ? 'rgba(239,82,137,.13)' : 'transparent'} /> }}
      listeners={{tabPress:(event)=>{const href=latestChatHref??messagesInboxHref;prepare(href);event.preventDefault();router.push(href as never);}}}
    />
    <Tabs.Screen name="moments" options={{ title: 'Moments', tabBarIcon: ({ color, size, focused }) => <Images color={color} size={focused ? size + 1 : size} /> }} listeners={{tabPress:()=>prepare('/moments')}} />
    <Tabs.Screen name="create" options={{ title: 'Create', tabBarIcon: ({ color, size }) => <Plus color={color} size={size + 2} />, tabBarButton: (props) => <MobileTabButton {...props} href={undefined} onPress={(event) => { event.preventDefault(); setCreateOpen(true); }} /> }} listeners={{tabPress:(event)=>{event.preventDefault();setCreateOpen(true);}}} />
    <Tabs.Screen name="upgrade" options={{ href: null }} />
    <Tabs.Screen name="profile" options={{ href: null }} />
    <Tabs.Screen name="dates" options={{ href: null }} />
    <Tabs.Screen name="singles" options={{ href: null }} />
    <Tabs.Screen name="market" options={{ href: null }} />
  </Tabs>
    <CreateMenu visible={createOpen} onClose={()=>setCreateOpen(false)} onCreateCharacter={()=>{setCreateOpen(false);prepare('/create/companion');router.push('/create/companion');}} />
  </>;
}

function FrostedTabBarBackground({liquidGlass}:{liquidGlass:boolean}) {
  if(liquidGlass)return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <IosLiquidGlass colorScheme="dark" glassEffectStyle="regular" tintColor="#342536" style={styles.nativeGlass} />
    <View style={styles.nativeGlassWash} />
  </View>;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <BlurView tint="systemMaterialDark" intensity={78} blurMethod="dimezisBlurViewSdk31Plus" style={[StyleSheet.absoluteFill, styles.glassBlur]} />
    <View style={styles.glassWash} />
  </View>;
}

const styles = StyleSheet.create({
  nativeGlass: {
    ...StyleSheet.absoluteFill,
    borderRadius: 34,
    borderCurve: 'continuous',
  },
  nativeGlassWash: {
    ...StyleSheet.absoluteFill,
    borderRadius: 34,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(37,23,43,.1)',
  },
  glassBlur: {
    backgroundColor: 'rgba(15,12,21,.66)',
    ...(web ? ({ backdropFilter: 'blur(30px) saturate(145%)' } as never) : {}),
  },
  glassWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(37,24,44,.34)',
    ...(web ? ({ backgroundImage: 'linear-gradient(135deg, rgba(119,67,132,.18), rgba(17,13,24,.42) 48%, rgba(93,44,76,.16))' } as never) : {}),
  },
});

