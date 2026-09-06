import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Brain, Check, MessageCircle, ShieldCheck } from 'lucide-react-native';
import { router } from 'expo-router';
import { GradientButton, KivelleLogo, Screen } from '../src/components';
import { manageAccount } from '../src/lib/api';
import { useTogether } from '../src/store/useTogether';
import { colors, radius, spacing, typography } from '../src/theme';

type TextPreference='standard'|'mature'|'explicit';

export default function PrivacyChoice(){
  const snapshot=useTogether((state)=>state.snapshot),refresh=useTogether((state)=>state.refresh);
  const[preference,setPreference]=useState<TextPreference|null>(null);
  const[sharing,setSharing]=useState<boolean|null>(null);
  const[busy,setBusy]=useState(false),[error,setError]=useState('');
  const save=async()=>{
    if(preference===null||sharing===null)return;
    setBusy(true);setError('');
    try{
      await manageAccount({action:'privacy_choices',privateTextPreference:preference,aiDataSharing:sharing,source:'onboarding'});
      await refresh({force:true});
      const profile=snapshot?.profile as (Record<string,unknown>|null|undefined);
      router.replace(profile?.onboarding_completed_at?'/home':'/choose-companion');
    }catch(caught){setError(caught instanceof Error?caught.message:'Your choices could not be saved.');}
    finally{setBusy(false);}
  };
  return <Screen contentStyle={styles.screen}>
    <View style={styles.card}>
      <KivelleLogo height={34}/>
      <View style={styles.heading}><View style={styles.icon}><ShieldCheck size={25} color={colors.warm}/></View><View style={{flex:1}}><Text style={styles.eyebrow}>YOUR PRIVACY CHOICES</Text><Text style={styles.title}>Choose what feels right.</Text></View></View>
      <View style={styles.section}>
        <View style={styles.sectionHeading}><MessageCircle size={18} color={colors.rose}/><Text style={styles.sectionTitle}>Private conversation tone</Text></View>
        <Text style={styles.body}>This controls the upper boundary for private text chats. It does not change public content, notifications, voice, or native visual restrictions.</Text>
        <View accessibilityRole="radiogroup" style={styles.options}>{([
          ['standard','Standard','Everyday conversation and storytelling'],
          ['mature','Mature','Adult themes without explicit sexual detail'],
          ['explicit','Explicit','Private adult dialogue with fictional adult characters'],
        ] as const).map(([value,label,detail])=><Choice key={value} selected={preference===value} label={label} detail={detail} onPress={()=>setPreference(value)}/>)}</View>
      </View>
      <View style={styles.section}>
        <View style={styles.sectionHeading}><Brain size={18} color={colors.violet}/><Text style={styles.sectionTitle}>AI data sharing</Text></View>
        <Text style={styles.body}>Kivelle uses OpenAI, Google, xAI, Venice AI, WaveSpeed AI, and ElevenLabs for features you choose to use. Depending on the feature, Kivelle may send conversation context and selected memories, photos you share or generate from, or audio you ask to process.</Text>
        <Text style={styles.body}>This permission is separate from your age and conversation choice. You can change it later in Privacy. If you decline, account, privacy, support, and deletion controls remain available, but AI chat and media features will not work.</Text>
        <View accessibilityRole="radiogroup" style={styles.options}><Choice selected={sharing===true} label="Allow AI processing" detail="Use chat, memory, media, and voice features" onPress={()=>setSharing(true)}/><Choice selected={sharing===false} label="Not now" detail="Continue with account and privacy controls only" onPress={()=>setSharing(false)}/></View>
      </View>
      {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
      <GradientButton label={busy?'Saving…':'Save and continue'} disabled={busy||preference===null||sharing===null} onPress={()=>void save()}/>
    </View>
  </Screen>;
}

function Choice({selected,label,detail,onPress}:{selected:boolean;label:string;detail:string;onPress:()=>void}){
  return <Pressable accessibilityRole="radio" accessibilityState={{checked:selected}} onPress={onPress} style={[styles.choice,selected&&styles.choiceSelected]}><View style={{flex:1}}><Text style={styles.choiceLabel}>{label}</Text><Text style={styles.choiceDetail}>{detail}</Text></View><View style={[styles.check,selected&&styles.checkSelected]}>{selected?<Check size={14} color="#fff"/>:null}</View></Pressable>;
}

const styles=StyleSheet.create({
  screen:{minHeight:'100%',maxWidth:620,justifyContent:'center',paddingHorizontal:16,paddingVertical:24},card:{gap:spacing.lg,padding:24,borderRadius:radius.xl,borderWidth:1,borderColor:colors.borderBright,backgroundColor:colors.surface},heading:{flexDirection:'row',alignItems:'center',gap:13},icon:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(242,198,125,.1)',borderWidth:1,borderColor:'rgba(242,198,125,.25)'},eyebrow:{color:colors.warm,fontSize:9,fontWeight:'900',letterSpacing:1.1},title:{color:colors.text,fontFamily:typography.display,fontSize:30,lineHeight:36,fontWeight:'600',marginTop:3},section:{gap:10},sectionHeading:{flexDirection:'row',alignItems:'center',gap:8},sectionTitle:{color:colors.text,fontWeight:'900',fontSize:15},body:{color:colors.muted,fontSize:12,lineHeight:18},options:{gap:8},choice:{minHeight:60,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:14,paddingVertical:10,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.background},choiceSelected:{borderColor:colors.rose,backgroundColor:'rgba(216,62,234,.08)'},choiceLabel:{color:colors.text,fontSize:13,fontWeight:'900'},choiceDetail:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:2},check:{width:22,height:22,borderRadius:11,borderWidth:1,borderColor:colors.borderBright,alignItems:'center',justifyContent:'center'},checkSelected:{backgroundColor:colors.rose,borderColor:colors.rose},error:{color:colors.danger,fontSize:12,lineHeight:18,fontWeight:'700'},
});
