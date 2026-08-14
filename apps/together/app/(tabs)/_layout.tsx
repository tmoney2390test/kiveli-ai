import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Compass, Heart, Home, MessageCircle, Sparkles } from 'lucide-react-native';
import { colors } from '../../src/theme';

const web = Platform.OS === 'web';

export default function TabsLayout() {
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.rose,
    tabBarInactiveTintColor: colors.dimmed,
    tabBarActiveBackgroundColor: 'rgba(232,93,140,.12)',
    tabBarStyle: {
      height: 78, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.surface,
      borderTopColor: colors.border, borderTopWidth: 1, elevation: 12,
      ...(web ? { position: 'absolute', width: 560, left: '50%', marginLeft: -280, bottom: 18, borderRadius: 24, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' } : {}),
    },
    tabBarItemStyle: { borderRadius: 14, marginHorizontal: 2 },
    tabBarLabelStyle: { fontSize: 10, fontWeight: '800' },
  }}>
    <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size, focused }) => <Home color={color} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="singles" options={{ title: 'Discover', tabBarIcon: ({ color, size, focused }) => <Sparkles color={color} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="chat-tab" options={{ title: 'Chat', tabBarIcon: ({ color, focused }) => <MessageCircle color={focused ? '#fff' : color} size={focused ? 29 : 25} fill={focused ? colors.rose : 'transparent'} /> }} />
    <Tabs.Screen name="worlds" options={{ title: 'World', tabBarIcon: ({ color, size, focused }) => <Compass color={color} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="moments" options={{ title: 'Moments', tabBarIcon: ({ color, size, focused }) => <Heart color={color} fill={focused ? color : 'transparent'} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="profile" options={{ href: null }} />
    <Tabs.Screen name="dates" options={{ href: null }} />
    <Tabs.Screen name="market" options={{ href: null }} />
  </Tabs>;
}
