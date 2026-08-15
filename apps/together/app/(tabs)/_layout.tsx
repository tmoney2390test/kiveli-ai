import { Platform, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { Compass, Heart, Home, MessageCircle, Sparkles } from 'lucide-react-native';
import { colors } from '../../src/theme';

const web = Platform.OS === 'web';

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const webBarWidth = Math.max(280, Math.min(560, width - 24));
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.rose,
    tabBarInactiveTintColor: '#998E9A',
    tabBarActiveBackgroundColor: 'rgba(232,93,140,.11)',
    tabBarStyle: {
      height: 70,
      paddingTop: 4,
      paddingBottom: 7,
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      elevation: 12,
      ...(web ? { position: 'fixed' as never, zIndex: 100, width: webBarWidth, left: '50%', marginLeft: -webBarWidth / 2, bottom: width < 620 ? 10 : 18, borderRadius: 22, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' } : {}),
    },
    tabBarItemStyle: { borderRadius: 12, marginHorizontal: 2, marginVertical: 4 },
    tabBarLabelStyle: { fontSize: 9.5, fontWeight: '800' },
  }}>
    <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size, focused }) => <Home color={color} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="singles" options={{ title: 'Discover', tabBarIcon: ({ color, size, focused }) => <Sparkles color={color} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="chat-tab" options={{ title: 'Chat', tabBarStyle: { display: 'none' }, tabBarIcon: ({ color, focused }) => <MessageCircle color={focused ? '#fff' : color} size={focused ? 28 : 24} fill={focused ? colors.rose : 'transparent'} /> }} />
    <Tabs.Screen name="worlds" options={{ title: 'World', tabBarIcon: ({ color, size, focused }) => <Compass color={color} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="moments" options={{ title: 'Moments', tabBarIcon: ({ color, size, focused }) => <Heart color={color} fill={focused ? color : 'transparent'} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="profile" options={{ href: null }} />
    <Tabs.Screen name="dates" options={{ href: null }} />
    <Tabs.Screen name="market" options={{ href: null }} />
  </Tabs>;
}
