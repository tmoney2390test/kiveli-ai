import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { characterAssets } from '../src/assets';
import { Body, GradientButton, Screen } from '../src/components';
import { colors, radius, spacing } from '../src/theme';

export default function MeetMaya(){return <Screen contentStyle={{minHeight:'100%',padding:0}}><Image source={characterAssets.maya} style={{height:520,width:'100%'}} contentFit="cover" contentPosition="top"/><View style={styles.panel}><Text style={styles.time}>FRIDAY · 5:38 PM</Text><Text style={styles.place}>Juniper Café</Text><Body muted>You’re waiting for your coffee when someone approaches the empty chair across from you.</Body><View style={styles.quote}><Text style={styles.name}>Maya</Text><Text style={styles.line}>“Is anyone sitting here?”</Text></View><GradientButton label="Answer Maya" onPress={()=>router.replace('/chat')}/></View></Screen>;}
const styles=StyleSheet.create({panel:{marginTop:-28,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,backgroundColor:colors.background,padding:spacing.lg,gap:spacing.md},time:{color:colors.rose,fontSize:11,fontWeight:'800',letterSpacing:1.5},place:{fontFamily:'Georgia',fontSize:32,color:colors.text},quote:{backgroundColor:colors.elevated,borderRadius:radius.md,padding:spacing.lg,gap:8},name:{color:colors.rose,fontWeight:'800'},line:{color:colors.text,fontSize:19,lineHeight:28,fontFamily:'Georgia'}});
