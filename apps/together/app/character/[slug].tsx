import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ArrowLeft, Check, MapPin, Sparkles } from 'lucide-react-native';
import { Body, CharacterAvatar, EmptyState, GradientButton, LoadingSkeleton, MoodBadge, RelationshipBadge, Screen, resolveCharacterPortraitSource } from '../../src/components';
import { meetCompanion, setActiveCompanion } from '../../src/lib/api';
import { colors, radius, spacing } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { worldForLocation } from '../../src/lib/place';
import { selectPortraitVersion } from '../../src/lib/selectors';

export default function CharacterProfile(){
  const{slug,intro}=useLocalSearchParams<{slug:string;intro?:string}>();
  const{snapshot,setSnapshot}=useTogether();
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  if(!snapshot)return <LoadingSkeleton/>;
  const instance=snapshot.characters.find((item)=>item.together_character_templates.slug===slug||item.together_character_templates.public_handle===slug||item.character_template_id===slug);
  const discoverable=snapshot.discoverableCharacters?.find((item)=>item.slug===slug||item.public_handle===slug||item.id===slug);
  const template=instance?.together_character_templates??discoverable;
  const baseVersion=instance?.together_character_versions??discoverable?.together_character_versions;
  if(!template||!baseVersion)return <EmptyState title="You haven’t crossed paths yet" body="Some people enter your world through introductions and shared events." action="Back to Discover" onAction={()=>router.replace('/(tabs)/singles')}/>;
  const version=instance?selectPortraitVersion(snapshot,instance):baseVersion;
  const asset=resolveCharacterPortraitSource(template,version,template.slug);
  const known=Boolean(instance&&(instance.contact_added_at||instance.introduced_at));
  const selectable=Boolean(template.can_be_selected);
  const active=instance?.id===snapshot.activeContinuity?.active_companion_instance_id;
  const locationRow=instance?snapshot.locations.find((item)=>item.id===instance.current_location_id):undefined;
  const world=instance?worldForLocation(snapshot,instance.current_location_id):undefined;
  const location=locationRow?.name??world?.name??'Current place';
  const moments=instance?snapshot.moments.filter((item)=>item.character_instance_id===instance.id):[];
  const daysKnown=instance?Math.max(1,Math.floor((Date.now()-Date.parse(instance.met_at))/86_400_000)+1):0;
  const placesTogether=new Set(moments.map((item)=>item.location_id).filter(Boolean)).size;
  const upcoming=instance?snapshot.sharedPlans.filter((item)=>item.character_instance_id===instance.id&&['scheduled','active'].includes(item.status)).length:0;
  const handle=template.public_handle??template.slug;const act=async()=>{setBusy(true);setError('');try{if(!instance){setSnapshot(await meetCompanion(template.id));router.replace(`/(tabs)/chat-tab?character=${handle}` as never);return;}if(selectable&&!active)setSnapshot(await setActiveCompanion(instance.id,'discover_profile'));router.push(`/(tabs)/chat-tab?character=${handle}` as never);}catch(caught){setError(caught instanceof Error?caught.message:'Could not continue right now.');}finally{setBusy(false);}};
  const canTalk=selectable||known;
  return <Screen contentStyle={{padding:0}}>
    <View style={styles.hero}>{asset?<Image source={asset} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top"/>:<View style={styles.fallback}><CharacterAvatar slug={template.slug} name={template.name} template={template} version={version} size={150}/></View>}<Pressable onPress={()=>router.back()} style={styles.back}><ArrowLeft color="#fff"/></Pressable><View style={styles.shade}/><View style={styles.title}><Text style={styles.name}>{template.name}</Text><Text style={styles.job}>{template.occupation}</Text></View></View>
    <View style={styles.body}>
      {intro==='1'?<View style={styles.welcome}><Sparkles size={18} color={colors.rose}/><View style={{flex:1}}><Text style={styles.welcomeTitle}>Your story starts here</Text><Text style={styles.welcomeCopy}>Say hello in your own words. {template.name} will remember what matters.</Text></View></View>:null}
      <View style={styles.badges}>{instance?<MoodBadge mood={instance.current_mood}/>:null}{instance&&known?<RelationshipBadge stage={instance.relationship_stage}/>:<Text style={styles.newBadge}>NEW CONNECTION</Text>}</View>
      <Text style={styles.heading}>{known?`Your relationship with ${template.name}`:`Meet ${template.name}`}</Text>
      <Body muted>{template.biography}</Body>
      {instance?<><Info label="Right now" value={instance.current_activity}/><Info label="Location" value={location}/></>:null}
      <Info label="Occupation" value={template.occupation}/><Info label="Interests" value={(version.interests??[]).join(', ')}/>
      {known?<View style={styles.history}><Stat value={String(daysKnown)} label="Days known"/><Stat value={String(moments.length)} label="Moments"/><Stat value={String(upcoming||placesTogether)} label={upcoming?'Upcoming':'Places together'}/></View>:null}
      {error?<Text style={styles.error}>{error}</Text>:null}
      {canTalk?<GradientButton disabled={busy} label={busy?'Opening your story…':instance?`Talk to ${template.name}`:`Meet ${template.name}`} onPress={()=>void act()}/>:<View style={styles.notMet}><MapPin size={18} color={colors.muted}/><Text style={styles.notMetText}>You haven’t been introduced yet. Their story will unfold through people, places, and events in their world.</Text></View>}
      {known&&instance&&!active&&selectable?<Pressable disabled={busy} onPress={async()=>{setBusy(true);try{setSnapshot(await setActiveCompanion(instance.id,'discover_profile'));}finally{setBusy(false);}}} style={styles.secondary}><Check size={16} color={colors.rose}/><Text style={styles.secondaryText}>Make {template.name} active on Home</Text></Pressable>:null}
      {known&&instance?<View style={styles.links}><Pressable onPress={()=>router.push(`/memories?character=${handle}` as never)}><Text style={styles.link}>What {template.name} remembers</Text></Pressable><Pressable onPress={()=>router.push('/(tabs)/moments')}><Text style={styles.link}>Shared moments</Text></Pressable></View>:null}
    </View>
  </Screen>;
}
function Info({label,value}:{label:string;value:string}){return <View style={styles.info}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>}
function Stat({value,label}:{value:string;label:string}){return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>}
const styles=StyleSheet.create({hero:{height:500,justifyContent:'flex-end',backgroundColor:colors.elevated},fallback:{...StyleSheet.absoluteFill,alignItems:'center',justifyContent:'center'},shade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(8,11,19,.28)'},back:{position:'absolute',top:52,left:16,zIndex:2,width:42,height:42,borderRadius:21,backgroundColor:'rgba(8,11,19,.58)',alignItems:'center',justifyContent:'center'},title:{padding:spacing.lg,zIndex:1},name:{fontFamily:'Georgia',fontSize:42,color:'#fff'},job:{color:'#fff',fontSize:16,marginTop:4},body:{marginTop:-20,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,backgroundColor:colors.background,padding:spacing.lg,gap:spacing.md},badges:{flexDirection:'row',gap:8,alignItems:'center'},newBadge:{color:colors.rose,fontSize:10,fontWeight:'900',letterSpacing:1.2},heading:{fontFamily:'Georgia',fontSize:24,color:colors.text},info:{flexDirection:'row',justifyContent:'space-between',paddingVertical:10,borderBottomWidth:1,borderBottomColor:colors.border},label:{color:colors.muted},value:{color:colors.text,maxWidth:'67%',textAlign:'right'},history:{flexDirection:'row',gap:8},stat:{flex:1,padding:12,borderRadius:radius.md,backgroundColor:colors.surface,alignItems:'center'},statValue:{fontFamily:'Georgia',fontSize:24,color:colors.text},statLabel:{fontSize:9,color:colors.muted,fontWeight:'800',marginTop:2,textAlign:'center'},welcome:{flexDirection:'row',gap:10,padding:13,borderRadius:radius.md,backgroundColor:'rgba(232,93,140,.10)',borderWidth:1,borderColor:'rgba(232,93,140,.22)'},welcomeTitle:{color:colors.text,fontWeight:'900'},welcomeCopy:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:3},secondary:{minHeight:50,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:radius.md,borderWidth:1,borderColor:colors.border},secondaryText:{color:colors.text,fontWeight:'800'},notMet:{flexDirection:'row',gap:10,padding:14,borderRadius:radius.md,backgroundColor:colors.surface},notMetText:{flex:1,color:colors.muted,fontSize:12,lineHeight:18},links:{flexDirection:'row',justifyContent:'space-around',paddingVertical:8},link:{color:colors.rose,fontWeight:'800',fontSize:12},error:{color:colors.danger}});
