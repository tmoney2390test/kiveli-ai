import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { initiativeLevels, normalizeInitiativeLevel, type InitiativeLevel } from '@together/domain';
import { ArrowLeft, Bell, CalendarDays, LockKeyhole, Sparkles } from 'lucide-react-native';
import { CharacterAvatar, GradientButton, PageTitle, Screen } from '../src/components';
import { colors, radius } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { invoke } from '../src/lib/api';
import { deactivatePushNotifications, registerPushNotifications } from '../src/lib/pushNotifications';
import { subscriptionHref } from '../src/lib/subscriptionPresentation';

const times=[{value:'21:00',label:'9 PM'},{value:'22:00',label:'10 PM'},{value:'23:00',label:'11 PM'},{value:'00:00',label:'Midnight'},{value:'07:00',label:'7 AM'},{value:'08:00',label:'8 AM'},{value:'09:00',label:'9 AM'}];
const initiativeCopy:Record<InitiativeLevel,string>={off:'Only messages you start.',occasional:'A light check-in now and then.',natural:'Believable updates around their life.',frequent:'More openings and follow-ups.'};

export default function Notifications(){
  const{snapshot,refresh}=useTogether(),preferences=snapshot?.notificationPreferences,initiativeEntitled=snapshot?.entitlements?.entitlement_keys?.includes('proactive_messages')===true;
  const companions=useMemo(()=>snapshot?.characters??[],[snapshot?.characters]);
  const[push,setPush]=useState(preferences?.push_enabled??false),[initiative,setInitiative]=useState<InitiativeLevel>(normalizeInitiativeLevel(preferences?.initiative_level,preferences?.character_initiated_messages===false?'off':'natural')),[overrides,setOverrides]=useState<Record<string,InitiativeLevel>>(preferences?.companion_initiative_levels??{}),[selected,setSelected]=useState(snapshot?.profile?.active_companion_instance_id??companions[0]?.id??''),[dates,setDates]=useState(preferences?.date_reminders??true),[world,setWorld]=useState(preferences?.world_event_updates??true),[start,setStart]=useState(preferences?.quiet_hours_start??'23:00'),[end,setEnd]=useState(preferences?.quiet_hours_end??'08:00'),[busy,setBusy]=useState(false);
  const hydrated=useRef(false),selectedCompanion=companions.find((item)=>item.id===selected)??companions[0];
  useEffect(()=>{if(!preferences||hydrated.current)return;hydrated.current=true;setPush(preferences.push_enabled);setInitiative(normalizeInitiativeLevel(preferences.initiative_level,preferences.character_initiated_messages===false?'off':'natural'));setOverrides(preferences.companion_initiative_levels??{});setDates(preferences.date_reminders??true);setWorld(preferences.world_event_updates??true);setStart(preferences.quiet_hours_start);setEnd(preferences.quiet_hours_end);},[preferences]);
  useEffect(()=>{if(!selected&&companions[0])setSelected(companions[0].id);},[companions,selected]);

  const save=async()=>{setBusy(true);try{
    if(push){const result=await registerPushNotifications(true);if(!result.registered){setPush(false);throw new Error(result.permission==='denied'?'Notifications are blocked in this device\'s settings.':'Push notifications are unavailable on this device.');}}
    else await deactivatePushNotifications();
    await invoke('together-notifications',{action:'preferences',pushEnabled:push,characterInitiatedMessages:initiative!=='off',initiativeLevel:initiative,companionInitiativeLevels:overrides,dateReminders:dates,worldEventUpdates:world,quietHoursStart:start,quietHoursEnd:end,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'});await refresh();Alert.alert('Notification preferences saved');
  }catch(error){Alert.alert('Could not save',error instanceof Error?error.message:'Try again.');}finally{setBusy(false);}};
  const setOverride=(value:InitiativeLevel|'default')=>{if(!selectedCompanion)return;setOverrides((current)=>{const next={...current};if(value==='default')delete next[selectedCompanion.id];else next[selectedCompanion.id]=value;return next;});};

  return <Screen contentStyle={styles.screen}>
    <View style={styles.header}><Pressable accessibilityLabel="Go back" onPress={()=>router.canGoBack()?router.back():router.replace('/settings')}><ArrowLeft color={colors.text}/></Pressable><PageTitle>Notifications & initiative</PageTitle></View>
    <Text style={styles.lead}>Choose when companions can reach out and whether Kivelle may alert this device.</Text>
    <Toggle icon={<Bell color={colors.rose}/>} title="Device notifications" body="Show Kivelle messages outside the app." value={push} set={setPush}/>

    <Section title="Companion initiative" icon={<Sparkles size={17} color={colors.violet}/> }>
      {!initiativeEntitled?<Pressable onPress={()=>router.push(subscriptionHref({intent:'initiative',returnTo:'/notifications'}) as never)} style={styles.locked}><LockKeyhole size={18} color={colors.violet}/><View style={{flex:1}}><Text style={styles.lockedTitle}>Kivelle+ feature</Text><Text style={styles.body}>Companions remember their lives on every plan. Upgrade to let them naturally start conversations.</Text></View></Pressable>:null}
      <LevelChoices value={initiative} disabled={!initiativeEntitled} includeDefault={false} onChange={(value)=>value!=='default'&&setInitiative(value)}/>
      <Text style={styles.hint}>{initiativeCopy[initiative]} Plan reminders are controlled separately.</Text>
    </Section>

    {initiativeEntitled&&companions.length?<Section title="Per-companion pace" icon={<Sparkles size={17} color={colors.rose}/> }>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.companions}>{companions.map((item)=><Pressable key={item.id} onPress={()=>setSelected(item.id)} style={[styles.companion,item.id===selectedCompanion?.id&&styles.companionActive]}><CharacterAvatar slug={item.together_character_templates.slug} name={item.together_character_templates.name} template={item.together_character_templates} version={item.together_character_versions} size={30}/><Text numberOfLines={1} style={[styles.companionName,item.id===selectedCompanion?.id&&styles.companionNameActive]}>{item.together_character_templates.name.split(' ')[0]}</Text></Pressable>)}</ScrollView>
      {selectedCompanion?<><Text style={styles.overrideLabel}>{selectedCompanion.together_character_templates.name}</Text><LevelChoices value={overrides[selectedCompanion.id]??'default'} disabled={false} includeDefault onChange={setOverride}/><Text style={styles.hint}>{overrides[selectedCompanion.id]?`${initiativeCopy[overrides[selectedCompanion.id]!]} Overrides your ${initiative} default.`:`Uses your ${initiative} default.`}</Text></>:null}
    </Section>:null}

    <Section title="Reminders" icon={<CalendarDays size={17} color={colors.warm}/> }>
      <Toggle icon={<CalendarDays color={colors.warm}/>} title="Date and plan reminders" body="Keep planned commitments visible even when companion initiative is off." value={dates} set={setDates}/>
      <Toggle icon={<Bell color={colors.rose}/>} title="World events" body="Introductions and meaningful changes across your Kivelle worlds." value={world} set={setWorld}/>
    </Section>

    <Section title="Quiet hours" icon={<Bell size={17} color={colors.muted}/> }>
      <Text style={styles.label}>Start</Text><TimeChoices value={start} onChange={setStart}/>
      <Text style={styles.label}>End</Text><TimeChoices value={end} onChange={setEnd}/>
      <Text style={styles.hint}>Messages wait until quiet hours end. You can still open Kivelle anytime.</Text>
    </Section>
    <GradientButton label={busy?'Saving…':'Save preferences'} disabled={busy||!preferences} onPress={()=>void save()}/>
  </Screen>;
}

function Section({title,icon,children}:{title:string;icon:React.ReactNode;children:React.ReactNode}){return <View style={styles.section}><View style={styles.sectionTitleRow}>{icon}<Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>;}
function LevelChoices({value,disabled,includeDefault,onChange}:{value:InitiativeLevel|'default';disabled:boolean;includeDefault:boolean;onChange:(value:InitiativeLevel|'default')=>void}){const values:Array<InitiativeLevel|'default'>=includeDefault?['default',...initiativeLevels]:[...initiativeLevels];return <View accessibilityRole="radiogroup" style={styles.levels}>{values.map((level)=><Pressable key={level} accessibilityRole="radio" accessibilityState={{checked:value===level,disabled}} disabled={disabled} onPress={()=>onChange(level)} style={[styles.level,value===level&&styles.levelActive,disabled&&styles.disabled]}><Text style={[styles.levelText,value===level&&styles.levelTextActive]}>{level==='default'?'Default':level[0]!.toUpperCase()+level.slice(1)}</Text></Pressable>)}</View>;}
function TimeChoices({value,onChange}:{value:string;onChange:(value:string)=>void}){return <View style={styles.times}>{times.map((item)=><Pressable key={item.value} accessibilityRole="radio" accessibilityState={{checked:value===item.value}} onPress={()=>onChange(item.value)} style={[styles.time,value===item.value&&styles.timeActive]}><Text style={[styles.timeText,value===item.value&&styles.timeTextActive]}>{item.label}</Text></Pressable>)}</View>;}
function Toggle({icon,title,body,value,set}:{icon:React.ReactNode;title:string;body:string;value:boolean;set:(value:boolean)=>void}){return <View style={styles.row}>{icon}<View style={{flex:1}}><Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text></View><Switch accessibilityLabel={title} value={value} onValueChange={set} trackColor={{false:colors.elevated,true:colors.rose}}/></View>;}

const styles=StyleSheet.create({
  screen:{maxWidth:760,width:'100%',alignSelf:'center',gap:18},header:{flexDirection:'row',gap:14,alignItems:'center'},lead:{color:colors.muted,lineHeight:20},section:{gap:12,padding:16,borderRadius:radius.lg,backgroundColor:'rgba(25,20,34,.78)',borderWidth:1,borderColor:colors.border},sectionTitleRow:{flexDirection:'row',alignItems:'center',gap:8},sectionTitle:{color:colors.text,fontFamily:'Georgia',fontSize:20,fontWeight:'700'},row:{minHeight:70,flexDirection:'row',gap:11,alignItems:'center',padding:13,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},title:{color:colors.text,fontWeight:'800'},body:{color:colors.muted,fontSize:12,marginTop:3,lineHeight:17},label:{color:colors.textSecondary,fontSize:12,fontWeight:'800',textTransform:'uppercase',letterSpacing:.7},hint:{color:colors.muted,fontSize:12,lineHeight:18},levels:{flexDirection:'row',flexWrap:'wrap',gap:7},level:{minHeight:40,paddingHorizontal:13,alignItems:'center',justifyContent:'center',borderRadius:radius.pill,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},levelActive:{backgroundColor:'rgba(155,99,215,.2)',borderColor:colors.violet},levelText:{color:colors.muted,fontSize:11,fontWeight:'800'},levelTextActive:{color:colors.text},disabled:{opacity:.42},locked:{flexDirection:'row',alignItems:'center',gap:11,padding:13,borderRadius:radius.md,backgroundColor:'rgba(155,99,215,.1)',borderWidth:1,borderColor:'rgba(155,99,215,.28)'},lockedTitle:{color:colors.text,fontWeight:'900'},companions:{gap:8,paddingRight:8},companion:{maxWidth:116,flexDirection:'row',alignItems:'center',gap:7,padding:7,paddingRight:11,borderRadius:radius.pill,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},companionActive:{borderColor:colors.violet,backgroundColor:'rgba(155,99,215,.16)'},companionName:{maxWidth:66,color:colors.muted,fontSize:11,fontWeight:'800'},companionNameActive:{color:colors.text},overrideLabel:{color:colors.text,fontWeight:'900'},times:{flexDirection:'row',flexWrap:'wrap',gap:7},time:{paddingHorizontal:13,paddingVertical:10,borderRadius:radius.pill,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},timeActive:{backgroundColor:colors.rose,borderColor:colors.rose},timeText:{color:colors.muted,fontWeight:'800',fontSize:11},timeTextActive:{color:'#fff'},
});
