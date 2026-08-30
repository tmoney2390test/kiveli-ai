import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../src/providers/AppProviders';
import { colors } from '../src/theme';
import { createKivelliNavigationTheme } from '../src/lib/navigationTheme';
import { RouteTransitionVeil } from '../src/components/RouteTransitionVeil';

const navigationTheme=createKivelliNavigationTheme(DarkTheme);

export default function RootLayout(){return <ThemeProvider value={navigationTheme}><AppProviders><StatusBar style="light"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.background},animation:'fade'}}/><RouteTransitionVeil/></AppProviders></ThemeProvider>;}
