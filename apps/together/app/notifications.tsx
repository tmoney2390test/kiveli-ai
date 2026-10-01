import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { initiativeLevels, normalizeInitiativeLevel, type InitiativeLevel } from '@together/domain/src/life';
import { ArrowLeft, Bell, CalendarDays, LockKeyhole, Moon, Sparkles } from 'lucide-react-native';
import { GradientButton, PageTitle, Screen } from '../src/components';
import {QuietHoursTimeField} from '../src/components/QuietHoursTimeField';
import { colors, radius } from '../src/theme';
import { settingsMaterial as glass } from '../src/styles/settingsMaterial';
import { useTogether } from '../src/store/useTogether';
import { invoke } from '../src/lib/api';
import { deactivatePushNotifications, registerPushNotifications } from '../src/lib/pushNotifications';
import { subscriptionHref } from '../src/lib/subscriptionPresentation';

export default function Notifications(){
  const{snapshot,refresh}=useTogether(),preferences=snapshot?.notificationPreferences,initiativeEntitled=snapshot?.entitlements?.tier!=='free'&&snapshot?.entitlements?.entitlement_keys?.includes('proactive_messages')===true;
  const[push,setPush]=useState(preferences?.push_enabled??false),[initiative,setInitiative]=useState<InitiativeLevel>(normalizeInitiativeLevel(preferences?.initiative_level,preferences?.character_initiated_messages===false?'off':'natural')),[dates,setDates]=useState(preferences?.date_reminders??true),[world,setWorld]=useState(preferences?.world_event_updates??true),[start,setStart]=useState((preferences?.quiet_hours_start??'23:00').slice(0,5)),[end,setEnd]=useState((preferences?.quiet_hours_end??'08:00').slice(0,5)),[busy,setBusy]=useState(false);
  const hydrated=useRef(false);
  useEffect(()=>{if(!preferences||hydrated.current)return;hydrated.current=true;setPush(preferences.push_enabled);setInitiative(normalizeInitiativeLevel(preferences.initiative_level,preferences.character_initiated_messages===false?'off':'natural'));setDates(preferences.date_reminders??true);setWorld(preferences.world_event_updates??true);setStart(preferences.quiet_hours_start.slice(0,5));setEnd(preferences.quiet_hours_end.slice(0,5));},[preferences]);

  const save=async()=>{setBusy(true);try{
    if(push){const result=await registerPushNotifications(true);if(!result.registered){setPush(false);throw new Error(result.permission==='denied'?'Notifications are blocked in this device\'s settings.':'Push notifications are unavailable on this device.');}}
    else await deactivatePushNotifications();
    await invoke('together-notifications',{action:'preferences',pushEnabled:push,characterInitiatedMessages:initiative!=='off',initiativeLevel:initiative,dateReminders:dates,worldEventUpdates:world,quietHoursStart:start,quietHoursEnd:end,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'});await refresh({force:true});Alert.alert('Notification preferences saved');
  }catch(error){Alert.alert('Could not save',error instanceof Error?error.message:'Try again.');}finally{setBusy(false);}};

  return <Screen contentStyle={styles.screen}>
    <View style={styles.header}><Pressable accessibilityLabel="Go back" onPress={()=>router.canGoBack()?router.back():router.replace('/settings')}><ArrowLeft color={colors.text}/></Pressable><PageTitle>Notifications & initiative</PageTitle></View>
    <Text style={styles.lead}>Choose when companions can reach out and whether Kivelle may alert this device.</Text>
    <Toggle icon={<Bell color={glass.accent}/>} title="Device notifications" body="Show Kivelle messages outside the app." value={push} set={setPush}/>

    <Section title="Companion initiative" icon={<Sparkles size={17} color={colors.violet}/> }>
      {!initiativeEntitled?<Pressable onPress={()=>router.push(subscriptionHref({intent:'initiative',returnTo:'/notifications'}) as never)} style={styles.locked}><LockKeyhole size={18} color={colors.violet}/><View style={{flex:1}}><Text style={styles.lockedTitle}>Kivelle+ feature</Text><Text style={styles.body}>Companions remember their lives on every plan. Upgrade to let them naturally start conversations.</Text></View></Pressable>:null}
      <Text style={styles.hint}>How often your companions reach out. Override this in Companion chat settings.</Text>
      <LevelChoices value={initiative} disabled={!initiativeEntitled} onChange={setInitiative}/>
    </Section>

    <Section title="Reminders" icon={<CalendarDays size={17} color={glass.accent}/> }>
      <Toggle icon={<CalendarDays color={glass.accent}/>} title="Date and plan reminders" body="Keep planned commitments visible even when companion initiative is off." value={dates} set={setDates}/>
      <Toggle icon={<Bell color={glass.accent}/>} title="World events" body="Introductions and meaningful changes across your Kivelle worlds." value={world} set={setWorld}/>
    </Section>

    <Section title="Quiet hours" icon={<Moon size={17} color={colors.violet}/> }>
      <View style={styles.quietTimeRow}><QuietHoursTimeField label="Start" value={start} onChange={setStart}/><QuietHoursTimeField label="End" value={end} onChange={setEnd}/></View>
      <Text style={styles.hint}>Account default. Companion and Life overrides are managed in Chat settings → Proactive. Messages wait until their quiet hours end.</Text>
    </Section>
    <GradientButton label={busy?'Saving…':'Save preferences'} disabled={busy||!preferences} onPress={()=>void save()}/>
  </Screen>;
}

function Section({title,icon,children}:{title:string;icon:React.ReactNode;children:React.ReactNode}){return <View style={styles.section}><View style={styles.sectionTitleRow}>{icon}<Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>;}
function LevelChoices({value,disabled,onChange}:{value:InitiativeLevel;disabled:boolean;onChange:(value:InitiativeLevel)=>void}){return <View accessibilityRole="radiogroup" style={styles.levels}>{initiativeLevels.map((level)=><Pressable key={level} accessibilityRole="radio" accessibilityState={{checked:value===level,disabled}} disabled={disabled} onPress={()=>onChange(level)} style={[styles.level,value===level&&styles.levelActive,disabled&&styles.disabled]}><Text style={[styles.levelText,value===level&&styles.levelTextActive]}>{level==='occasional'?'Quiet':level[0]!.toUpperCase()+level.slice(1)}</Text></Pressable>)}</View>;}
function Toggle({icon,title,body,value,set}:{icon:React.ReactNode;title:string;body:string;value:boolean;set:(value:boolean)=>void}){return <View style={styles.row}>{icon}<View style={{flex:1}}><Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text></View><Switch accessibilityLabel={title} value={value} onValueChange={set} trackColor={{false:colors.elevated,true:glass.accent}}/></View>;}

const styles=StyleSheet.create({
  screen:{maxWidth:760,width:'100%',alignSelf:'center',gap:18},header:{flexDirection:'row',gap:14,alignItems:'center'},lead:{color:colors.muted,lineHeight:20},section:{gap:12,padding:16,borderRadius:radius.lg,backgroundColor:glass.glass,borderWidth:1,borderColor:glass.border},sectionTitleRow:{flexDirection:'row',alignItems:'center',gap:8},sectionTitle:{color:colors.text,fontFamily:'Georgia',fontSize:20,fontWeight:'700'},row:{minHeight:70,flexDirection:'row',gap:11,alignItems:'center',padding:13,borderRadius:radius.md,backgroundColor:glass.inset,borderWidth:1,borderColor:glass.border},title:{color:colors.text,fontWeight:'800'},body:{color:colors.muted,fontSize:12,marginTop:3,lineHeight:17},hint:{color:colors.muted,fontSize:12,lineHeight:18},levels:{flexDirection:'row',flexWrap:'wrap',gap:7},level:{minHeight:40,paddingHorizontal:13,alignItems:'center',justifyContent:'center',borderRadius:radius.pill,backgroundColor:glass.inset,borderWidth:1,borderColor:glass.border},levelActive:{backgroundColor:glass.selected,borderColor:glass.selectedBorder},levelText:{color:colors.muted,fontSize:11,fontWeight:'800'},levelTextActive:{color:colors.text},disabled:{opacity:.42},locked:{flexDirection:'row',alignItems:'center',gap:11,padding:13,borderRadius:radius.md,backgroundColor:glass.selected,borderWidth:1,borderColor:glass.border},lockedTitle:{color:colors.text,fontWeight:'900'},quietTimeRow:{flexDirection:'row',flexWrap:'wrap',gap:10},
});
