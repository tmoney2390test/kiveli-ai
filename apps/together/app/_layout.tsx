import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../src/providers/AppProviders';
import { colors } from '../src/theme';

export default function RootLayout(){return <AppProviders><StatusBar style="light"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.background},animation:'fade'}}/></AppProviders>;}
