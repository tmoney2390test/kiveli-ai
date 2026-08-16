import { Platform, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { CalendarDays, Compass, Home, MessageCircle, UserRound } from 'lucide-react-native';
import { colors } from '../../src/theme';

const web = Platform.OS === 'web';

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const webBarWidth = Math.max(280, Math.min(560, width - 24));
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: '#F0C77F',
    tabBarInactiveTintColor: '#8F8992',
    tabBarActiveBackgroundColor: 'rgba(240,199,127,.08)',
    tabBarStyle: {
      height: 70,
      paddingTop: 4,
      paddingBottom: 7,
      backgroundColor: '#0E0D11',
      borderTopColor: colors.border,
      borderTopWidth: 1,
      elevation: 12,
      ...(web ? { position: 'fixed' as never, zIndex: 100, width: webBarWidth, left: '50%', marginLeft: -webBarWidth / 2, bottom: width < 620 ? 10 : 18, borderRadius: 22, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' } : {}),
    },
    tabBarItemStyle: { borderRadius: 12, marginHorizontal: 2, marginVertical: 4 },
    tabBarLabelStyle: { fontSize: 9.5, fontWeight: '800' },
  }}>
    <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size, focused }) => <Home color={color} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="chat-tab" options={{ title: 'Chat', tabBarIcon: ({ color, size, focused }) => <MessageCircle color={color} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: ({ color, size, focused }) => <Compass color={color} size={focused ? size + 2 : size} fill={focused ? 'rgba(240,199,127,.14)' : 'transparent'} /> }} />
    <Tabs.Screen name="dates" options={{ title: 'Dates', tabBarIcon: ({ color, size, focused }) => <CalendarDays color={color} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size, focused }) => <UserRound color={color} size={focused ? size + 1 : size} /> }} />
    <Tabs.Screen name="singles" options={{ href: null }} />
    <Tabs.Screen name="worlds" options={{ href: null }} />
    <Tabs.Screen name="moments" options={{ href: null }} />
    <Tabs.Screen name="market" options={{ href: null }} />
  </Tabs>;
}
