import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Camera, Trash2 } from 'lucide-react-native';
import { GradientButton, LoadingSkeleton, PageTitle, Screen } from '../src/components';
import { useAuth } from '../src/hooks/useAuth';
import { useProfileAvatarUrl } from '../src/hooks/useProfileAvatarUrl';
import { cleanupNormalizedImage, normalizeUserImage, type NormalizedUserImage } from '../src/lib/imageUploads';
import { managePersona } from '../src/lib/api';
import { supabase } from '../src/lib/supabase';
import { useTogether } from '../src/store/useTogether';
import { colors, radius } from '../src/theme';
import type { UserPersona } from '../src/types';

type ResponseLength='concise'|'balanced'|'detailed';
type QuestionFrequency='low'|'natural'|'high';
type Tone='gentle'|'natural'|'direct';

export default function PersonaEditor(){
  const params=useLocalSearchParams<{persona?:string}>();
  const{snapshot,setCoreState}=useTogether();
  const{session}=useAuth();
  const existing=snapshot?.personas?.find((item)=>item.id===params.persona);
  const[name,setName]=useState('');
  const[pronouns,setPronouns]=useState('');
  const[age,setAge]=useState('');
  const[occupation,setOccupation]=useState('');
  const[about,setAbout]=useState('');
  const[interests,setInterests]=useState('');
  const[avatarPath,setAvatarPath]=useState<string|null>(null);
  const[responseLength,setResponseLength]=useState<ResponseLength>('balanced');
  const[questionFrequency,setQuestionFrequency]=useState<QuestionFrequency>('natural');
  const[tone,setTone]=useState<Tone>('natural');
  const[busy,setBusy]=useState(false);
  const avatarUrl=useProfileAvatarUrl(avatarPath);

  useEffect(()=>{
    if(!existing)return;
    const communication=existing.communication_config??{};
    const appearance=existing.appearance_config??{};
    setName(existing.display_name);
    setPronouns(existing.pronouns??'');
    setAge(existing.age?String(existing.age):'');
    setOccupation(existing.occupation??'');
    setAbout(existing.biography??'');
    setInterests(existing.interests.join(', '));
    setAvatarPath(typeof appearance.avatarPath==='string'?appearance.avatarPath:existing.is_default?snapshot?.profile?.avatar_path??null:null);
    setResponseLength(oneOf<ResponseLength>(communication.responseLength,['concise','balanced','detailed'],'balanced'));
    setQuestionFrequency(oneOf<QuestionFrequency>(communication.questionFrequency,['low','natural','high'],'natural'));
    setTone(oneOf<Tone>(communication.tone,['gentle','natural','direct'],'natural'));
  },[existing,snapshot?.profile?.avatar_path]);

  if(!snapshot)return <LoadingSkeleton/>;

  const pickAvatar=async()=>{
    const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(!permission.granted){Alert.alert('Photo permission needed','Allow photo access to choose a Persona photo.');return;}
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:1});
    if(result.canceled||!result.assets[0]||!session)return;
    const asset=result.assets[0];
    let normalized:NormalizedUserImage|null=null;
    setBusy(true);
    try{
      normalized=await normalizeUserImage({uri:asset.uri,width:asset.width,height:asset.height,fileSize:asset.fileSize,fileName:asset.fileName},.9);
      const path=`${session.user.id}/persona-avatars/${existing?.id??'draft'}/avatar-${Date.now()}.jpg`;
      const blob=await(await fetch(normalized.uri)).blob();
      const{error}=await supabase.storage.from('together-user-media').upload(path,blob,{contentType:normalized.mimeType,upsert:false,cacheControl:'31536000'});
      if(error)throw error;
      setAvatarPath(path);
    }catch(error){Alert.alert('Photo upload failed',error instanceof Error?error.message:'Please try again.');}
    finally{cleanupNormalizedImage(normalized?.uri);setBusy(false);}
  };

  const save=async()=>{
    setBusy(true);
    try{
      const payload={displayName:name.trim(),pronouns:pronouns.trim()||null,age:age?Number(age):null,occupation:occupation.trim()||null,biography:about.trim()||null,interests:interests.split(',').map((item)=>item.trim()).filter(Boolean).slice(0,12),appearanceConfig:{avatarPath,description:typeof existing?.appearance_config?.description==='string'?existing.appearance_config.description:null},communicationConfig:{responseLength,questionFrequency,tone},metadata:existing?.metadata??{}};
      const saved=await managePersona<UserPersona>(existing?{action:'update',personaId:existing.id,...payload}:{action:'create',...payload});
      const personas=existing?(snapshot.personas??[]).map((item)=>item.id===saved.id?saved:item):[...(snapshot.personas??[]),saved];
      setCoreState({personas,activePersona:snapshot.activePersona?.id===saved.id?saved:snapshot.activePersona,continuities:(snapshot.continuities??[]).map((life)=>life.persona_id===saved.id?{...life,together_user_personas:saved}:life)});
      router.replace('/personas');
    }catch(error){Alert.alert(`Could not ${existing?'update':'create'} Persona`,error instanceof Error?error.message:'Please try again.');}
    finally{setBusy(false);}
  };

  const remove=()=>existing&&!existing.is_default?Alert.alert(`Delete ${existing.display_name}?`,'This is only available when the Persona has no Kivelle Life or relationship history.',[{text:'Keep persona',style:'cancel'},{text:'Delete persona',style:'destructive',onPress:async()=>{setBusy(true);try{await managePersona({action:'delete_persona',personaId:existing.id,confirmation:'DELETE PERSONA'});setCoreState({personas:(snapshot.personas??[]).filter((item)=>item.id!==existing.id)});router.replace('/personas');}catch(error){Alert.alert('Persona could not be deleted',error instanceof Error?error.message:'Delete its Alternate Lives first.');}finally{setBusy(false);}}}]):undefined;

  return <Screen>
    <View style={styles.header}><Pressable accessibilityLabel="Back" onPress={()=>router.canGoBack()?router.back():router.replace('/personas')}><ArrowLeft color={colors.text}/></Pressable><View><PageTitle>{existing?'Edit persona':'Create persona'}</PageTitle><Text style={styles.subtitle}>Who are you in this Life?</Text></View></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose Persona photo" onPress={()=>void pickAvatar()} style={styles.avatar}>{avatarUrl?<Image source={{uri:avatarUrl}} style={StyleSheet.absoluteFill} contentFit="cover"/>:<Text style={styles.avatarInitial}>{(name||'Y')[0]?.toUpperCase()}</Text>}<View style={styles.camera}><Camera size={15} color="#fff"/></View></Pressable>
    <Label text="What should companions call you?"/><TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Jordan" placeholderTextColor={colors.muted}/>
    <View style={styles.row}><View style={{flex:1}}><Label text="Pronouns"/><TextInput value={pronouns} onChangeText={setPronouns} style={styles.input} placeholder="they/them" placeholderTextColor={colors.muted}/></View><View style={{width:92}}><Label text="Age"/><TextInput value={age} onChangeText={setAge} style={styles.input} keyboardType="number-pad" placeholder="31" placeholderTextColor={colors.muted}/></View></View>
    <Label text="Occupation"/><TextInput value={occupation} onChangeText={setOccupation} style={styles.input} placeholder="Musician" placeholderTextColor={colors.muted}/>
    <Label text="About you"/><TextInput value={about} onChangeText={setAbout} style={[styles.input,styles.multiline]} multiline placeholder="How you see yourself in Kivelle" placeholderTextColor={colors.muted}/>
    <Label text="Interests"/><TextInput value={interests} onChangeText={setInterests} style={styles.input} placeholder="Jazz, travel, food" placeholderTextColor={colors.muted}/>
    <Text style={styles.sectionTitle}>How companions talk with you</Text>
    <Label text="Response length"/><ChoiceRow value={responseLength} options={[["concise","Concise"],["balanced","Balanced"],["detailed","Detailed"]]} onChange={(value)=>setResponseLength(value as ResponseLength)}/>
    <Label text="Questions"/><ChoiceRow value={questionFrequency} options={[["low","Fewer"],["natural","Natural"],["high","Curious"]]} onChange={(value)=>setQuestionFrequency(value as QuestionFrequency)}/>
    <Label text="Tone"/><ChoiceRow value={tone} options={[["gentle","Gentle"],["natural","Natural"],["direct","Direct"]]} onChange={(value)=>setTone(value as Tone)}/>
    <Text style={styles.note}>{existing?'Updates apply to every Life using this Persona. Contradictory inferred identity details are retired, while relationship history stays separate and intact.':'This Persona can start a separate Alternate Life. It will never replace who you are in an existing relationship.'}</Text>
    <GradientButton label={busy?'Saving…':existing?'Save persona':'Create persona'} disabled={busy||!name.trim()||(age!==''&&(!Number.isInteger(Number(age))||Number(age)<18))} onPress={()=>void save()}/>
    {existing&&!existing.is_default?<Pressable onPress={remove} disabled={busy} style={styles.delete}><Trash2 size={16} color={colors.danger}/><Text style={styles.deleteText}>Delete unused persona</Text></Pressable>:null}
  </Screen>;
}

function ChoiceRow({value,options,onChange}:{value:string;options:Array<[string,string]>;onChange:(value:string)=>void}){return <View style={styles.choices}>{options.map(([key,label])=><Pressable key={key} accessibilityRole="radio" accessibilityState={{selected:value===key}} onPress={()=>onChange(key)} style={[styles.choice,value===key&&styles.choiceActive]}><Text style={[styles.choiceText,value===key&&styles.choiceTextActive]}>{label}</Text></Pressable>)}</View>;}
const Label=({text}:{text:string})=><Text style={styles.label}>{text}</Text>;
function oneOf<T extends string>(value:unknown,allowed:readonly T[],fallback:T):T{return typeof value==='string'&&allowed.includes(value as T)?value as T:fallback;}

const styles=StyleSheet.create({
  header:{flexDirection:'row',alignItems:'center',gap:14},subtitle:{color:colors.muted,fontSize:12,marginTop:3},avatar:{alignSelf:'center',width:104,height:104,borderRadius:52,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:colors.elevated,borderWidth:1,borderColor:colors.border},avatarInitial:{fontFamily:'Georgia',fontSize:42,color:colors.text},camera:{position:'absolute',right:3,bottom:3,width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:colors.violet},label:{color:colors.muted,fontSize:11,fontWeight:'800',marginTop:3},input:{minHeight:52,paddingHorizontal:14,paddingVertical:11,color:colors.text,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.md},multiline:{height:100,textAlignVertical:'top'},row:{flexDirection:'row',gap:10},sectionTitle:{color:colors.text,fontFamily:'Georgia',fontSize:20,marginTop:10},choices:{flexDirection:'row',gap:7},choice:{flex:1,minHeight:43,alignItems:'center',justifyContent:'center',borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},choiceActive:{borderColor:colors.violet,backgroundColor:'rgba(155,99,215,.18)'},choiceText:{color:colors.muted,fontSize:12,fontWeight:'800'},choiceTextActive:{color:colors.text},note:{color:colors.muted,fontSize:12,lineHeight:18,padding:12,borderRadius:radius.md,backgroundColor:colors.elevated},delete:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},deleteText:{color:colors.danger,fontWeight:'800'},
});
