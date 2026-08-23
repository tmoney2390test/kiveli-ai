import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Bell, CalendarDays, Sparkles } from 'lucide-react-native';
import { GradientButton, PageTitle, Screen } from '../src/components';
import { colors, radius } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { invoke } from '../src/lib/api';
import { activeCompanion } from '../src/lib/companionLife';
import { deactivatePushNotifications, registerPushNotifications } from '../src/lib/pushNotifications';

const times=[{value:'21:00',label:'9 PM'},{value:'22:00',label:'10 PM'},{value:'23:00',label:'11 PM'},{value:'00:00',label:'Midnight'},{value:'07:00',label:'7 AM'},{value:'08:00',label:'8 AM'},{value:'09:00',label:'9 AM'}];

export default function Notifications(){
  const{snapshot,refresh}=useTogether(),preferences=snapshot?.notificationPreferences;
  const name=snapshot?activeCompanion(snapshot)?.together_character_templates.name??'companions':'companions';
  const[push,setPush]=useState(preferences?.push_enabled??false),[characters,setCharacters]=useState(preferences?.character_initiated_messages??true),[dates,setDates]=useState(preferences?.date_reminders??true),[world,setWorld]=useState(preferences?.world_event_updates??true),[start,setStart]=useState(preferences?.quiet_hours_start??'23:00'),[end,setEnd]=useState(preferences?.quiet_hours_end??'08:00'),[busy,setBusy]=useState(false);
  const hydrated=useRef(false);
  useEffect(()=>{if(!preferences||hydrated.current)return;hydrated.current=true;setPush(preferences.push_enabled);setCharacters(preferences.character_initiated_messages);setDates(preferences.date_reminders??true);setWorld(preferences.world_event_updates??true);setStart(preferences.quiet_hours_start);setEnd(preferences.quiet_hours_end);},[preferences]);
  const save=async()=>{setBusy(true);try{
    if(push){const result=await registerPushNotifications(true);if(!result.registered){setPush(false);throw new Error(result.permission==='denied'?'Notifications are blocked in this device\'s settings.':'Push notifications are unavailable on this device.');}}
    else await deactivatePushNotifications();
    await invoke('together-notifications',{action:'preferences',pushEnabled:push,characterInitiatedMessages:characters,dateReminders:dates,worldEventUpdates:world,quietHoursStart:start,quietHoursEnd:end,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'});await refresh();Alert.alert('Notification preferences saved');
  }catch(error){Alert.alert('Could not save',error instanceof Error?error.message:'Try again.');}finally{setBusy(false);}};
  return <Screen><View style={styles.header}><Pressable accessibilityLabel="Go back" onPress={()=>router.back()}><ArrowLeft color={colors.text}/></Pressable><PageTitle>Notifications</PageTitle></View><Text style={styles.lead}>Choose what deserves to interrupt your day. Turning push off preserves your choices.</Text><Toggle icon={<Bell color={colors.rose}/>} title="Push notifications" body="Allow Kivelle to notify this device." value={push} set={setPush}/><View style={!push&&styles.dim}><Toggle disabled={!push} icon={<Sparkles color={colors.violet}/>} title={`Messages from ${name}`} body="Naturally timed updates from their life." value={characters} set={setCharacters}/><Toggle disabled={!push} icon={<CalendarDays color={colors.warm}/>} title="Date and plan reminders" body="A heads-up before something you planned together." value={dates} set={setDates}/><Toggle disabled={!push} icon={<Bell color={colors.rose}/>} title="World events" body="Introductions and meaningful changes across your Kivelle worlds." value={world} set={setWorld}/></View><Text style={styles.label}>Quiet hours start</Text><TimeChoices value={start} onChange={setStart}/><Text style={styles.label}>Quiet hours end</Text><TimeChoices value={end} onChange={setEnd}/><Text style={styles.hint}>Nothing will notify you during quiet hours. You can still open Kivelle anytime.</Text><GradientButton label={busy?'Saving…':'Save preferences'} disabled={busy||!preferences} onPress={()=>void save()}/></Screen>;
}

function TimeChoices({value,onChange}:{value:string;onChange:(value:string)=>void}){return <View style={styles.times}>{times.map((item)=><Pressable key={item.value} accessibilityRole="button" accessibilityState={{selected:value===item.value}} onPress={()=>onChange(item.value)} style={[styles.time,value===item.value&&styles.timeActive]}><Text style={[styles.timeText,value===item.value&&styles.timeTextActive]}>{item.label}</Text></Pressable>)}</View>;}
function Toggle({icon,title,body,value,set,disabled=false}:{icon:React.ReactNode;title:string;body:string;value:boolean;set:(value:boolean)=>void;disabled?:boolean}){return <View style={styles.row}>{icon}<View style={{flex:1}}><Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text></View><Switch accessibilityLabel={title} disabled={disabled} value={value} onValueChange={set} trackColor={{false:colors.elevated,true:colors.rose}}/></View>;}

const styles=StyleSheet.create({header:{flexDirection:'row',gap:14,alignItems:'center'},lead:{color:colors.muted,lineHeight:20},dim:{gap:20,opacity:.45},row:{minHeight:70,flexDirection:'row',gap:11,alignItems:'center',padding:13,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},title:{color:colors.text,fontWeight:'800'},body:{color:colors.muted,fontSize:12,marginTop:3},label:{color:colors.text,fontFamily:'Georgia',fontSize:19,marginTop:6},times:{flexDirection:'row',flexWrap:'wrap',gap:7},time:{paddingHorizontal:13,paddingVertical:10,borderRadius:radius.pill,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},timeActive:{backgroundColor:colors.rose,borderColor:colors.rose},timeText:{color:colors.muted,fontWeight:'800',fontSize:11},timeTextActive:{color:'#fff'},hint:{color:colors.muted,fontSize:12,lineHeight:18}});
