import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Camera, Trash2 } from 'lucide-react-native';
import { EmptyState, GradientButton, LoadingSkeleton, PageTitle, Screen } from '../src/components';
import { useAuth } from '../src/hooks/useAuth';
import { useProfileAvatarUrl } from '../src/hooks/useProfileAvatarUrl';
import { confirmAction, showActionAlert } from '../src/lib/dialogs';
import { ErrorState } from '../src/components/RouteState';
import { cleanupNormalizedImage, normalizeUserImage, userImagePickerOptions, type NormalizedUserImage } from '../src/lib/imageUploads';
import { personaAgeError, personaAvatarStoragePath, personaDraftChanged, personaInterestsError, personaSnapshotPatch, type PersonaEditorDraft } from '../src/lib/personaEditor';
import { createClientRequestId } from '../src/lib/requestId';
import { managePersona } from '../src/lib/api';
import { supabase } from '../src/lib/supabase';
import { useTogether } from '../src/store/useTogether';
import { colors, radius } from '../src/theme';
import type { UserPersona } from '../src/types';

type ResponseLength='concise'|'balanced'|'detailed';
type QuestionFrequency='low'|'natural'|'high';
type Tone='gentle'|'natural'|'direct';

export default function PersonaEditor(){
  const params=useLocalSearchParams<{persona?:string;character?:string}>();
  const{snapshot,setCoreState,refresh,loading,error:loadError}=useTogether();
  const{session}=useAuth();
  const existing=snapshot?.personas?.find((item)=>item.id===params.persona);
  const editorKey=params.persona??'new';
  const personasHref=params.character?`/personas?character=${encodeURIComponent(params.character)}`:'/personas';
  const draftScope=useRef(`draft-${createClientRequestId()}`).current;
  const hydratedKey=useRef<string|null>(null);
  const pendingUpload=useRef<string|null>(null);
  const attemptedLoad=useRef(false);
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
  const[savedDraft,setSavedDraft]=useState<PersonaEditorDraft|null>(null);
  const[saving,setSaving]=useState(false);
  const[uploading,setUploading]=useState(false);
  const[avatarFailed,setAvatarFailed]=useState(false);
  const[photoNotice,setPhotoNotice]=useState('');
  const avatarUrl=useProfileAvatarUrl(avatarPath);
  const currentDraft=useMemo<PersonaEditorDraft>(()=>({name,pronouns,age,occupation,about,interests,avatarPath,responseLength,questionFrequency,tone}),[about,age,avatarPath,interests,name,occupation,pronouns,questionFrequency,responseLength,tone]);
  const dirty=personaDraftChanged(savedDraft,currentDraft);
  const ageError=personaAgeError(age);
  const interestsError=personaInterestsError(interests);
  const [saveError,setSaveError]=useState('');
  const saveInFlight=useRef(false);
  const createRequest=useRef<{signature:string;id:string}|null>(null);
  const busy=saving||uploading;

  useEffect(()=>{
    if(snapshot||loading||loadError||attemptedLoad.current)return;
    attemptedLoad.current=true;
    void refresh();
  },[loadError,loading,refresh,snapshot]);

  useEffect(()=>{
    if(!snapshot||hydratedKey.current===editorKey)return;
    if(params.persona&&!existing)return;
    const communication=existing?.communication_config??{};
    const appearance=existing?.appearance_config??{};
    const next:PersonaEditorDraft={
      name:existing?.display_name??'',pronouns:existing?.pronouns??'',age:existing?.age?String(existing.age):'',occupation:existing?.occupation??'',about:existing?.biography??'',interests:(existing?.interests??[]).join(', '),
      avatarPath:typeof appearance.avatarPath==='string'?appearance.avatarPath:null,
      responseLength:oneOf<ResponseLength>(communication.responseLength,['concise','balanced','detailed'],'balanced'),
      questionFrequency:oneOf<QuestionFrequency>(communication.questionFrequency,['low','natural','high'],'natural'),
      tone:oneOf<Tone>(communication.tone,['gentle','natural','direct'],'natural'),
    };
    setName(next.name);setPronouns(next.pronouns);setAge(next.age);setOccupation(next.occupation);setAbout(next.about);setInterests(next.interests);setAvatarPath(next.avatarPath);setResponseLength(next.responseLength);setQuestionFrequency(next.questionFrequency);setTone(next.tone);setSavedDraft(next);setPhotoNotice('');
    hydratedKey.current=editorKey;
  },[editorKey,existing?.id,params.persona,snapshot]);

  useEffect(()=>{setAvatarFailed(false);},[avatarPath]);
  useEffect(()=>()=>{const path=pendingUpload.current;if(path&&!saveInFlight.current)void discardAvatar(path);},[]);
  useEffect(()=>{
    if(Platform.OS==='web'&&dirty&&typeof window!=='undefined'){
      const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
      window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
    }
    if(Platform.OS==='android'&&dirty){const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{leave();return true;});return()=>subscription.remove();}
    return undefined;
  },[dirty,busy]);

  if(!snapshot)return loading||(!loadError&&!attemptedLoad.current)
    ?<LoadingSkeleton label="Loading your Personas…"/>
    :<ErrorState message={loadError??'Your Personas could not be loaded.'} onRetry={()=>void refresh({force:true})}/>;
  if(params.persona&&!existing)return <Screen><View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back to Personas" onPress={()=>router.replace(personasHref as never)} style={styles.iconButton}><ArrowLeft color={colors.text}/></Pressable><PageTitle>Persona unavailable</PageTitle></View><EmptyState title="This Persona could not be found" body="It may have been deleted in another session." action="Back to your Lives" onAction={()=>router.replace(personasHref as never)}/></Screen>;

  function leave(){
    if(busy||saveInFlight.current)return;
    const go=()=>router.canGoBack()?router.back():router.replace(personasHref as never);
    if(!dirty){go();return;}
    confirmAction({title:'Discard Persona changes?',message:'Your unsaved identity and photo changes will be lost.',confirmLabel:'Discard changes',destructive:true,onConfirm:go});
  }

  function chooseAvatarSource(){
    if(busy)return;
    if(Platform.OS==='web'){void pickAvatar('library');return;}
    Alert.alert('Persona photo','Choose an existing photo or take a new one.',[
      {text:'Choose from library',onPress:()=>void pickAvatar('library')},
      {text:'Take photo',onPress:()=>void pickAvatar('camera')},
      {text:'Cancel',style:'cancel'},
    ]);
  }

  async function pickAvatar(source:'camera'|'library'){
    try{
      const permission=Platform.OS==='web'?{granted:true}:source==='camera'?await ImagePicker.requestCameraPermissionsAsync():await ImagePicker.requestMediaLibraryPermissionsAsync();
      if(!permission.granted){showActionAlert(source==='camera'?'Camera permission needed':'Photo permission needed',source==='camera'?'Allow camera access to take a Persona photo.':'Allow photo access to choose a Persona photo.');return;}
      const options={...userImagePickerOptions(source),allowsEditing:true,aspect:[1,1] as [number,number]};
      const result=source==='camera'?await ImagePicker.launchCameraAsync(options):await ImagePicker.launchImageLibraryAsync(options);
      if(result.canceled||!result.assets[0]||!session)return;
      const asset=result.assets[0];let normalized:NormalizedUserImage|null=null;
      setUploading(true);setPhotoNotice('Preparing photo…');
      try{
        normalized=await normalizeUserImage({uri:asset.uri,width:asset.width,height:asset.height,fileSize:asset.fileSize,fileName:asset.fileName},.9);
        const path=personaAvatarStoragePath(session.user.id,existing?.id??draftScope,createClientRequestId());
        const blob=await(await fetch(normalized.uri)).blob();
        setPhotoNotice('Uploading photo…');
        const{error}=await supabase.storage.from('together-user-media').upload(path,blob,{contentType:normalized.mimeType,upsert:false,cacheControl:'31536000'});
        if(error)throw error;
        const previous=pendingUpload.current;pendingUpload.current=path;setAvatarPath(path);setPhotoNotice('Photo ready — save your Persona to keep it.');
        if(previous&&previous!==path)void discardAvatar(previous);
      }finally{cleanupNormalizedImage(normalized?.uri);setUploading(false);}
    }catch(error){setPhotoNotice('');showActionAlert('Photo upload failed',error instanceof Error?error.message:'Please try again.');}
  }

  function removePhoto(){
    const pending=pendingUpload.current;pendingUpload.current=null;setAvatarPath(null);setPhotoNotice('Photo removed — save your Persona to apply this change.');
    if(pending)void discardAvatar(pending);
  }

  async function save(){
    if(busy||saveInFlight.current||!dirty||!name.trim())return;
    if(ageError){showActionAlert('Check the age',ageError);return;}
    if(interestsError){setSaveError(interestsError);return;}
    if(!snapshot)return;
    saveInFlight.current=true;setSaving(true);setSaveError('');
    try{
      const payload={displayName:name.trim(),pronouns:pronouns.trim()||null,age:age.trim()?Number(age):null,occupation:occupation.trim()||null,biography:about.trim()||null,interests:interests.split(',').map((item)=>item.trim()).filter(Boolean).slice(0,12),appearanceConfig:{avatarPath,description:typeof existing?.appearance_config?.description==='string'?existing.appearance_config.description:null},communicationConfig:{responseLength,questionFrequency,tone},metadata:existing?.metadata??{}};
      const signature=JSON.stringify(payload);
      if(!createRequest.current||createRequest.current.signature!==signature)createRequest.current={signature,id:createClientRequestId()};
      const saved=await managePersona<UserPersona>(existing?{action:'update',personaId:existing.id,...payload}:{action:'create',requestId:createRequest.current.id,...payload});
      pendingUpload.current=null;
      const latest=useTogether.getState().snapshot;
      if(latest)useTogether.getState().setSnapshot({...latest,...personaSnapshotPatch(latest,saved)});
      setSavedDraft(currentDraft);
      router.replace(personasHref as never);
    }catch(error){setSaveError(error instanceof Error?error.message:'Please try again. Your edits are still here.');}
    finally{saveInFlight.current=false;setSaving(false);}
  }

  const personaHasLife=Boolean(existing&&snapshot.continuities?.some((life)=>life.persona_id===existing.id));
  const remove=()=>{
    if(!existing||existing.is_default||personaHasLife||busy)return;
    confirmAction({
      title:`Delete ${existing.display_name}?`,
      message:'This permanently deletes this unused Persona. Lives and relationship history cannot be deleted here.',
      confirmLabel:'Delete Persona',
      destructive:true,
      onConfirm:async()=>{
        setSaving(true);
        try{
          await managePersona({action:'delete_persona',personaId:existing.id,confirmation:'DELETE PERSONA'});
          const pending=pendingUpload.current;pendingUpload.current=null;
          if(pending)void discardAvatar(pending);
          setCoreState({personas:(snapshot.personas??[]).filter((item)=>item.id!==existing.id)});
          router.replace(personasHref as never);
        }catch(error){showActionAlert('Persona could not be deleted',error instanceof Error?error.message:'Please try again.');}
        finally{setSaving(false);}
      },
    });
  };

  return <Screen>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back to Personas" onPress={leave} disabled={busy} style={styles.iconButton}><ArrowLeft color={colors.text}/></Pressable><View><PageTitle>{existing?'Edit Persona':'Create Persona'}</PageTitle><Text style={styles.subtitle}>Who are you in this Life?</Text></View></View>
    <View style={styles.photoSection}>
      <Pressable accessibilityRole="button" accessibilityLabel={avatarPath?'Replace Persona photo':'Add Persona photo'} accessibilityHint="Choose from your library or camera" disabled={busy} onPress={chooseAvatarSource} style={styles.avatar}>
        {avatarUrl&&!avatarFailed?<Image source={{uri:avatarUrl}} style={StyleSheet.absoluteFill} contentFit="cover" onError={()=>setAvatarFailed(true)}/>:<Text style={styles.avatarInitial}>{(name||'Y')[0]?.toUpperCase()}</Text>}
        {uploading?<View style={styles.avatarBusy}><ActivityIndicator color="#fff"/></View>:<View style={styles.camera}><Camera size={15} color="#fff"/></View>}
      </Pressable>
      <View style={styles.photoActions}><Pressable accessibilityRole="button" disabled={busy} onPress={chooseAvatarSource} style={styles.photoAction}><Text style={styles.photoActionText}>{avatarPath?'Replace photo':'Add photo'}</Text></Pressable>{avatarPath?<Pressable accessibilityRole="button" accessibilityLabel="Remove Persona photo" disabled={busy} onPress={removePhoto} style={styles.photoAction}><Text style={styles.photoRemoveText}>Remove</Text></Pressable>:null}</View>
      {photoNotice?<Text accessibilityLiveRegion="polite" style={styles.photoNotice}>{photoNotice}</Text>:null}
    </View>
    <Label text="What should companions call you?"/><TextInput editable={!busy} accessibilityLabel="Persona name" value={name} onChangeText={setName} maxLength={50} style={styles.input} placeholder="Jordan" placeholderTextColor={colors.muted} returnKeyType="next"/>
    <View style={styles.row}><View style={{flex:1}}><Label text="Pronouns"/><TextInput editable={!busy} accessibilityLabel="Persona pronouns" value={pronouns} onChangeText={setPronouns} maxLength={40} style={styles.input} placeholder="they/them" placeholderTextColor={colors.muted} returnKeyType="next"/></View><View style={{width:104}}><Label text="Age"/><TextInput editable={!busy} accessibilityLabel="Persona age" value={age} onChangeText={setAge} maxLength={3} style={[styles.input,ageError&&styles.inputError]} keyboardType="number-pad" placeholder="31" placeholderTextColor={colors.muted}/></View></View>
    {ageError?<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorText}>{ageError}</Text>:null}
    <Label text="Occupation"/><TextInput editable={!busy} accessibilityLabel="Persona occupation" value={occupation} onChangeText={setOccupation} maxLength={100} style={styles.input} placeholder="Musician" placeholderTextColor={colors.muted} returnKeyType="next"/>
    <Label text="About you"/><TextInput editable={!busy} accessibilityLabel="About this Persona" value={about} onChangeText={setAbout} maxLength={1000} style={[styles.input,styles.multiline]} multiline placeholder="How you see yourself in Kivelle" placeholderTextColor={colors.muted}/><Text style={styles.counter}>{about.length}/1000</Text>
    <Label text="Interests"/><TextInput editable={!busy} accessibilityLabel="Persona interests" value={interests} onChangeText={setInterests} style={styles.input} placeholder="Jazz, travel, food" placeholderTextColor={colors.muted}/><Text style={styles.helper}>Separate up to 12 interests with commas, up to 40 characters each.</Text>{interestsError?<Text accessibilityRole="alert" style={styles.errorText}>{interestsError}</Text>:null}
    <Text style={styles.sectionTitle}>How companions talk with you</Text>
    <Label text="Response length"/><ChoiceRow value={responseLength} options={[["concise","Concise"],["balanced","Balanced"],["detailed","Detailed"]]} onChange={(value)=>setResponseLength(value as ResponseLength)} disabled={busy}/>
    <Label text="Questions"/><ChoiceRow value={questionFrequency} options={[["low","Fewer"],["natural","Natural"],["high","Curious"]]} onChange={(value)=>setQuestionFrequency(value as QuestionFrequency)} disabled={busy}/>
    <Label text="Tone"/><ChoiceRow value={tone} options={[["gentle","Gentle"],["natural","Natural"],["direct","Direct"]]} onChange={(value)=>setTone(value as Tone)} disabled={busy}/>
    <Text style={styles.note}>{existing?'Updates apply to every Life using this Persona. Contradictory inferred identity details are retired, while relationship history stays separate and intact.':'This Persona can start a separate Alternate Life. It will never replace who you are in an existing relationship.'}</Text>
    {saveError?<Text accessibilityRole="alert" style={styles.errorText}>{saveError}</Text>:null}
    <GradientButton label={uploading?'Preparing photo…':saving?'Saving…':existing?'Save Persona':'Create Persona'} disabled={busy||!dirty||!name.trim()||Boolean(ageError)||Boolean(interestsError)} onPress={()=>void save()}/>
    {existing&&!dirty?<Text style={styles.savedState}>All changes saved</Text>:null}
    {existing&&!existing.is_default&&!personaHasLife?<Pressable accessibilityRole="button" accessibilityLabel={`Delete ${existing.display_name}`} onPress={remove} disabled={busy} style={styles.delete}><Trash2 size={16} color={colors.danger}/><Text style={styles.deleteText}>Delete unused Persona</Text></Pressable>:null}
  </Screen>;
}

async function discardAvatar(path:string){try{await managePersona({action:'discard_avatar',avatarPath:path});}catch{/* An uncertain save may already reference this photo. Only the server can safely remove it. */}}
function ChoiceRow({value,options,onChange,disabled}:{value:string;options:Array<[string,string]>;onChange:(value:string)=>void;disabled:boolean}){return <View accessibilityRole="radiogroup" style={styles.choices}>{options.map(([key,label])=><Pressable key={key} accessibilityRole="radio" accessibilityState={{checked:value===key,disabled}} disabled={disabled} onPress={()=>onChange(key)} style={[styles.choice,value===key&&styles.choiceActive]}><Text style={[styles.choiceText,value===key&&styles.choiceTextActive]}>{label}</Text></Pressable>)}</View>;}
const Label=({text}:{text:string})=><Text style={styles.label}>{text}</Text>;
function oneOf<T extends string>(value:unknown,allowed:readonly T[],fallback:T):T{return typeof value==='string'&&allowed.includes(value as T)?value as T:fallback;}

const styles=StyleSheet.create({
  header:{flexDirection:'row',alignItems:'center',gap:14},iconButton:{width:44,height:44,alignItems:'center',justifyContent:'center',borderRadius:22},subtitle:{color:colors.muted,fontSize:12,marginTop:3},photoSection:{alignItems:'center',gap:8},avatar:{width:104,height:104,borderRadius:52,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:colors.elevated,borderWidth:1,borderColor:colors.border},avatarInitial:{fontFamily:'Georgia',fontSize:42,color:colors.text},avatarBusy:{...StyleSheet.absoluteFill,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(8,7,12,.62)'},camera:{position:'absolute',right:3,bottom:3,width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:colors.violet},photoActions:{flexDirection:'row',gap:8},photoAction:{minHeight:44,justifyContent:'center',paddingHorizontal:14,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},photoActionText:{color:colors.violet,fontSize:12,fontWeight:'900'},photoRemoveText:{color:colors.danger,fontSize:12,fontWeight:'900'},photoNotice:{color:colors.muted,fontSize:11,textAlign:'center'},label:{color:colors.muted,fontSize:11,fontWeight:'800',marginTop:3},input:{minHeight:52,paddingHorizontal:14,paddingVertical:11,color:colors.text,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.md},inputError:{borderColor:colors.danger},errorText:{color:colors.danger,fontSize:11,marginTop:-10},multiline:{height:112,textAlignVertical:'top'},counter:{color:colors.muted,fontSize:10,textAlign:'right',marginTop:-13},helper:{color:colors.muted,fontSize:10,marginTop:-12},row:{flexDirection:'row',gap:10},sectionTitle:{color:colors.text,fontFamily:'Georgia',fontSize:20,marginTop:10},choices:{flexDirection:'row',gap:7},choice:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},choiceActive:{borderColor:colors.violet,backgroundColor:'rgba(155,99,215,.18)'},choiceText:{color:colors.muted,fontSize:12,fontWeight:'800'},choiceTextActive:{color:colors.text},note:{color:colors.muted,fontSize:12,lineHeight:18,padding:12,borderRadius:radius.md,backgroundColor:colors.elevated},savedState:{color:colors.muted,fontSize:11,textAlign:'center',marginTop:-10},delete:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},deleteText:{color:colors.danger,fontWeight:'800'},
});
