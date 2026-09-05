import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, Tabs, usePathname } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Compass, Crown, Home, Images, MessageCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppShell } from '../../src/shell/AppShellContext';
import { MESSAGES_INBOX_HREF, mostRecentChatHref, shouldOpenMostRecentChat, WEB_MESSAGES_INBOX_HREF } from '../../src/lib/messageInbox';
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
  const pathname=usePathname();
  const snapshot=useTogether((state)=>state.snapshot);
  const webBarWidth = Math.max(300, Math.min(720, width - 24));
  const openLatestFromCurrentPage=shouldOpenMostRecentChat(pathname);
  const latestChatHref=snapshot?mostRecentChatHref(snapshot.conversations,snapshot.characters):null;
  const messagesInboxHref=web?WEB_MESSAGES_INBOX_HREF:MESSAGES_INBOX_HREF;
  const[webInputFocused,setWebInputFocused]=useState(false);
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
  return <Tabs screenOptions={{
    headerShown: false,
    sceneStyle: { backgroundColor: colors.background, ...(web ? ({ minHeight: '100dvh' } as never) : {}) },
    tabBarActiveTintColor: '#FF86AB',
    tabBarInactiveTintColor: '#938996',
    tabBarActiveBackgroundColor: 'rgba(239,82,137,.12)',
    tabBarHideOnKeyboard: true,
    tabBarBackground: () => <FrostedTabBarBackground />,
    tabBarStyle: {
      display: desktop||desktopViewport||webInputFocused ? 'none' : 'flex',
      position: 'absolute',
      zIndex: 100,
      left: 8,
      right: 8,
      bottom: Math.max(8,insets.bottom),
      height: 72,
      paddingTop: 5,
      paddingBottom: 7,
      backgroundColor: 'transparent',
      borderTopWidth: 1,
      borderWidth: 1,
      borderColor: 'rgba(255,248,244,.11)',
      borderRadius: 20,
      elevation: 18,
      shadowColor: '#000',
      shadowOpacity: .45,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 13 },
      overflow: 'hidden',
      ...(web ? { position: 'fixed' as never, width: webBarWidth, left: '50%', right: undefined, marginLeft: -webBarWidth / 2, bottom: 'max(8px, env(safe-area-inset-bottom))' as never, backdropFilter: 'blur(30px) saturate(145%)' } : {}),
    },
    tabBarItemStyle: { minHeight:44,borderRadius: 14, marginHorizontal: 5, marginVertical: 7, overflow: 'hidden' },
    tabBarLabelStyle: { fontSize: 9, fontWeight: '800', letterSpacing: .12 },
  }}>
    <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size, focused }) => <Home color={color} size={focused ? size + 1 : size} fill={focused ? 'rgba(239,82,137,.13)' : 'transparent'} /> }} listeners={{tabPress:()=>prepare('/home')}} />
    <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: ({ color, size, focused }) => <Compass color={color} size={focused ? size + 2 : size} /> }} listeners={{tabPress:()=>prepare('/explore')}} />
    <Tabs.Screen
      name="chat-tab"
      options={{ title: 'Chat', tabBarIcon: ({ color, size, focused }) => <MessageCircle color={color} size={focused ? size + 2 : size} fill={focused ? 'rgba(239,82,137,.13)' : 'transparent'} /> }}
      listeners={{tabPress:(event)=>{const href=latestChatHref??messagesInboxHref;prepare(href);if(!openLatestFromCurrentPage)return;event.preventDefault();router.push(href as never);}}}
    />
    <Tabs.Screen name="moments" options={{ title: 'Moments', tabBarIcon: ({ color, size, focused }) => <Images color={color} size={focused ? size + 1 : size} /> }} listeners={{tabPress:()=>prepare('/moments')}} />
    <Tabs.Screen name="upgrade" options={{ title: 'Upgrade', tabBarIcon: ({ color, size, focused }) => <Crown color={focused?'#E8B3FF':color} size={focused ? size + 2 : size} fill={focused?'rgba(221,162,255,.16)':'transparent'} /> }} listeners={{tabPress:(event)=>{event.preventDefault();prepare('/subscription');router.push('/subscription' as never);}}} />
    <Tabs.Screen name="profile" options={{ href: null }} />
    <Tabs.Screen name="dates" options={{ href: null }} />
    <Tabs.Screen name="singles" options={{ href: null }} />
    <Tabs.Screen name="market" options={{ href: null }} />
  </Tabs>;
}

function FrostedTabBarBackground() {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <BlurView tint="systemMaterialDark" intensity={78} blurMethod="dimezisBlurViewSdk31Plus" style={[StyleSheet.absoluteFill, styles.glassBlur]} />
    <View style={styles.glassWash} />
  </View>;
}

const styles = StyleSheet.create({
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

