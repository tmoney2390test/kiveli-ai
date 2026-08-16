import { Platform, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { Compass, Globe2, Home, Images, MessageCircle } from 'lucide-react-native';

const web = Platform.OS === 'web';

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const webBarWidth = Math.max(300, Math.min(720, width - 24));
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: '#FF86AB',
    tabBarInactiveTintColor: '#938996',
    tabBarActiveBackgroundColor: 'rgba(239,82,137,.10)',
    tabBarStyle: {
      position: 'absolute',
      zIndex: 100,
      left: 12,
      right: 12,
      bottom: Platform.OS === 'ios' ? 18 : 10,
      height: 72,
      paddingTop: 5,
      paddingBottom: 7,
      backgroundColor: 'rgba(17,16,24,.94)',
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
      ...(web ? { position: 'fixed' as never, width: webBarWidth, left: '50%', right: undefined, marginLeft: -webBarWidth / 2, bottom: width < 620 ? 10 : 18, backdropFilter: 'blur(22px)' } : {}),
    },
    tabBarItemStyle: { borderRadius: 15, marginHorizontal: 3, marginVertical: 4 },
    tabBarLabelStyle: { fontSize: 9.5, fontWeight: '800', letterSpacing: .15 },
  }}>
    <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size, focused }) => <Home color={color} size={focused ? size + 1 : size} fill={focused ? 'rgba(239,82,137,.13)' : 'transparent'} /> }} />
    <Tabs.Screen name="explore" options={{ title: 'Discover', tabBarIcon: ({ color, size, focused }) => <Compass color={color} size={focused ? size + 2 : size} /> }} />
    <Tabs.Screen name="chat-tab" options={{ title: 'Chat', tabBarIcon: ({ color, size, focused }) => <MessageCircle color={color} size={focused ? size + 2 : size} fill={focused ? 'rgba(239,82,137,.13)' : 'transparent'} /> }} />
    <Tabs.Screen name="worlds" options={{ title: 'World', tabBarIcon: ({ color, size, focused }) => <Globe2 color={color} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="moments" options={{ title: 'Moments', tabBarIcon: ({ color, size, focused }) => <Images color={color} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="dates" options={{ href: null }} />
    <Tabs.Screen name="profile" options={{ href: null }} />
    <Tabs.Screen name="singles" options={{ href: null }} />
    <Tabs.Screen name="market" options={{ href: null }} />
  </Tabs>;
}
