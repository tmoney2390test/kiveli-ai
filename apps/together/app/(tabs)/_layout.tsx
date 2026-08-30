import { useEffect } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, Tabs, usePathname } from 'expo-router';
import { BlurView } from 'expo-blur';
import { BookOpenCheck, Compass, Home, Images, MessageCircle } from 'lucide-react-native';
import { useAppShell } from '../../src/shell/AppShellContext';
import { MESSAGES_INBOX_HREF, mostRecentChatHref, shouldOpenMostRecentChat } from '../../src/lib/messageInbox';
import { useTogether } from '../../src/store/useTogether';
import { colors } from '../../src/theme';
import { markRouteIntent, scheduleCoreRouteWarmup, warmRoute } from '../../src/lib/routeWarmup';
import { isDesktopShellViewport } from '../../src/lib/desktopNavigation';

const web = Platform.OS === 'web';

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const { desktop } = useAppShell();
  const desktopViewport=isDesktopShellViewport(Platform.OS,width);
  const pathname=usePathname();
  const snapshot=useTogether((state)=>state.snapshot);
  const webBarWidth = Math.max(300, Math.min(720, width - 24));
  const openLatestFromCurrentPage=shouldOpenMostRecentChat(pathname);
  const latestChatHref=snapshot?mostRecentChatHref(snapshot.conversations,snapshot.characters):null;
  useEffect(()=>snapshot?scheduleCoreRouteWarmup((href)=>router.prefetch(href as never)):undefined,[Boolean(snapshot)]);
  const prepare=(href:string)=>{markRouteIntent(href);warmRoute(href,(value)=>router.prefetch(value as never));};
  return <Tabs screenOptions={{
    headerShown: false,
    sceneStyle: { backgroundColor: colors.background },
    tabBarActiveTintColor: '#FF86AB',
    tabBarInactiveTintColor: '#938996',
    tabBarActiveBackgroundColor: 'rgba(239,82,137,.18)',
    tabBarBackground: () => <FrostedTabBarBackground />,
    tabBarStyle: {
      display: desktop||desktopViewport ? 'none' : 'flex',
      position: 'absolute',
      zIndex: 100,
      left: 12,
      right: 12,
      bottom: Platform.OS === 'ios' ? 18 : 10,
      height: 72,
      paddingTop: 5,
      paddingBottom: 7,
      backgroundColor: 'transparent',
      borderTopWidth: 1,
      borderWidth: 1,
      borderColor: 'rgba(255,248,244,.11)',
      borderRadius: 24,
      elevation: 18,
      shadowColor: '#000',
      shadowOpacity: .45,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 13 },
      overflow: 'hidden',
      ...(web ? { position: 'fixed' as never, width: webBarWidth, left: '50%', right: undefined, marginLeft: -webBarWidth / 2, bottom: width < 620 ? 10 : 18, backdropFilter: 'blur(30px) saturate(145%)' } : {}),
    },
    tabBarItemStyle: { borderRadius: 18, marginHorizontal: 3, marginVertical: 1, overflow: 'hidden' },
    tabBarLabelStyle: { fontSize: 9.5, fontWeight: '800', letterSpacing: .15 },
  }}>
    <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size, focused }) => <Home color={color} size={focused ? size + 1 : size} fill={focused ? 'rgba(239,82,137,.13)' : 'transparent'} /> }} listeners={{tabPress:()=>prepare('/home')}} />
    <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: ({ color, size, focused }) => <Compass color={color} size={focused ? size + 2 : size} /> }} listeners={{tabPress:()=>prepare('/explore')}} />
    <Tabs.Screen
      name="chat-tab"
      options={{ title: 'Chat', tabBarIcon: ({ color, size, focused }) => <MessageCircle color={color} size={focused ? size + 2 : size} fill={focused ? 'rgba(239,82,137,.13)' : 'transparent'} /> }}
      listeners={{tabPress:(event)=>{const href=latestChatHref??MESSAGES_INBOX_HREF;prepare(href);if(!openLatestFromCurrentPage)return;event.preventDefault();router.push(href as never);}}}
    />
    <Tabs.Screen name="moments" options={{ title: 'Moments', tabBarIcon: ({ color, size, focused }) => <Images color={color} size={focused ? size + 1 : size} /> }} listeners={{tabPress:()=>prepare('/moments')}} />
    <Tabs.Screen name="stories" options={{ title: 'Stories', tabBarIcon: ({ color, size, focused }) => <BookOpenCheck color={color} size={focused ? size + 2 : size} /> }} listeners={{tabPress:()=>prepare('/stories')}} />
    <Tabs.Screen name="profile" options={{ href: null }} />
    <Tabs.Screen name="upgrade" options={{ href: null }} />
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

