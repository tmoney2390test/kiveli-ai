import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Camera, Check, Film, ImagePlus, Send, Sparkles, X } from 'lucide-react-native';
import { createDirectVideo, getDirectVideoGenerationOptions } from '../lib/api';
import { customPhotoRequestText } from '../lib/photoRequestPresentation';
import { createClientRequestId } from '../lib/requestId';
import { preferredVideoRouteId, videoCreditCost, videoDurationRangeLabel } from '../lib/videoGeneration';
import { colors, radius } from '../theme';
import type { CharacterInstance, GeneratedMedia, VideoDurationSeconds, VideoGenerationOptions, VideoMotionPreset } from '../types';
import { CharacterAvatar } from './ui';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';
import { KivelleCreditIcon } from './KivelleCreditIcon';

type Props={
  visible:boolean;
  character:CharacterInstance;
  conversationId:string;
  onPhotoRequest:(request:string)=>void;
  photoSharingEntitled:boolean;
  onShareLibrary:()=>void;
  onTakePhoto?:()=>void;
  onPhotoSharingUpgrade:()=>void;
  onVideoCreated:(media:GeneratedMedia)=>void;
  onBuyCredits:()=>void;
  onClose:()=>void;
};

const PHOTO_OPTIONS=[
  {label:'What they’re doing',request:`Show me what you're doing right now.`},
  {label:'Where they are',request:`Show me where you are.`},
];
const VIDEO_PROMPTS=['Look toward the camera and smile','Walk naturally through the scene','A quiet cinematic moment'];

export function MediaRequestModal({visible,character,conversationId,onPhotoRequest,photoSharingEntitled,onShareLibrary,onTakePhoto,onPhotoSharingUpgrade,onVideoCreated,onBuyCredits,onClose}:Props){
  const name=character.together_character_templates.name;
  const[mode,setMode]=useState<'photo'|'video'>('photo'),[description,setDescription]=useState(''),[options,setOptions]=useState<VideoGenerationOptions|null>(null),[loading,setLoading]=useState(false),[submitting,setSubmitting]=useState(false),[error,setError]=useState<string|null>(null),[routeId,setRouteId]=useState(''),[durationSeconds,setDurationSeconds]=useState<VideoDurationSeconds>(10),[motionPreset,setMotionPreset]=useState<VideoMotionPreset>('subtle'),[aspectRatio,setAspectRatio]=useState<'9:16'|'16:9'>('9:16');
  useEffect(()=>{
    if(!visible){setDescription('');setMode('photo');setError(null);return;}
    let active=true;setOptions(null);setRouteId('');setLoading(true);setError(null);
    void getDirectVideoGenerationOptions(character.id).then((value)=>{if(!active)return;setOptions(value);setRouteId((current)=>preferredVideoRouteId(value,current));}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:'Video options could not be loaded.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[character.id,visible]);
  const route=useMemo(()=>options?.routes.find((item)=>item.id===routeId)??null,[options,routeId]);
  useEffect(()=>{if(route&&!route.allowedDurations.includes(durationSeconds))setDurationSeconds(route.durationSeconds);},[durationSeconds,route]);
  const balance=Number(options?.creditBalance??0),creditCost=route?videoCreditCost(route,durationSeconds):0,insufficient=Boolean(route&&balance<creditCost),canCreate=Boolean(route&&description.trim()&&route.allowedDurations.includes(durationSeconds)&&!submitting&&!options?.activeVideo&&!insufficient);
  const submitPhoto=()=>{const request=customPhotoRequestText(description);if(!request)return;setDescription('');onPhotoRequest(request);};
  const submitVideo=async()=>{if(!canCreate||!route)return;setSubmitting(true);setError(null);try{const result=await createDirectVideo({characterInstanceId:character.id,conversationId,videoRouteId:route.id,motionPreset,durationSeconds,aspectRatio,requestText:description.trim(),requestId:createClientRequestId()});onVideoCreated(result.media);}catch(cause){setError(cause instanceof Error?cause.message:'The video could not be started.');}finally{setSubmitting(false);}};
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View accessibilityViewIsModal style={styles.backdrop}>
      <FrostedBackdrop intensity={34}/><Pressable accessibilityLabel="Close media options" style={StyleSheet.absoluteFill} onPress={onClose}/>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':Platform.OS==='android'?'height':undefined} style={styles.frame}>
        <FrostedSurface intensity={82} style={styles.modal}>
          <Pressable accessibilityLabel="Close media options" onPress={onClose} style={styles.close}><X size={18} color={colors.muted}/></Pressable>
          <View accessibilityRole="radiogroup" style={styles.modeToggle}>
            <Pressable testID="media-mode-photo" accessibilityRole="radio" accessibilityState={{selected:mode==='photo'}} onPress={()=>setMode('photo')} style={[styles.modeOption,mode==='photo'&&styles.modeSelected]}><Camera size={16} color={mode==='photo'?'#fff':colors.muted}/><Text style={[styles.modeText,mode==='photo'&&styles.modeTextSelected]}>Photo</Text></Pressable>
            <Pressable testID="media-mode-video" accessibilityRole="radio" accessibilityState={{selected:mode==='video'}} onPress={()=>setMode('video')} style={[styles.modeOption,mode==='video'&&styles.modeSelected]}><Film size={16} color={mode==='video'?'#fff':colors.muted}/><Text style={[styles.modeText,mode==='video'&&styles.modeTextSelected]}>Video</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.portrait}><CharacterAvatar slug={character.together_character_templates.slug} name={name} template={character.together_character_templates} version={character.together_character_versions} size={80}/></View>
            <Text style={styles.title}>Share or create a moment</Text>
            {mode==='photo'?<PhotoComposer name={name} description={description} setDescription={setDescription} onRequest={onPhotoRequest} onSubmit={submitPhoto} photoSharingEntitled={photoSharingEntitled} onShareLibrary={onShareLibrary} onTakePhoto={onTakePhoto} onPhotoSharingUpgrade={onPhotoSharingUpgrade}/>:<>
              <Text style={styles.copy}>Create a video from your direction using {name}’s approved identity and current location references—no generated photo required.</Text>
              {loading?<View style={styles.loading}><ActivityIndicator color={colors.rose}/><Text style={styles.muted}>Loading video models…</Text></View>:null}
              {!loading&&options&&!options.available?<ErrorCopy text="Direct video is not available for this account yet."/>:null}
              {options?.referenceSummary?<View style={styles.referenceCard}><Sparkles size={15} color="#C7A6FF"/><Text style={styles.referenceText}>{options.referenceSummary.identity} identity reference{options.referenceSummary.identity===1?'':'s'}{options.referenceSummary.location?` · ${options.referenceSummary.locationName??'current location'}`:' · current scene context'}</Text></View>:null}
              {options?.routes.length?<>
                <Text style={styles.label}>VIDEO MODEL</Text>
                <View accessibilityRole="radiogroup" style={styles.routeList}>{options.routes.map((item)=><Pressable key={item.id} accessibilityRole="radio" accessibilityState={{selected:item.id===routeId}} accessibilityLabel={`${item.displayName}. ${item.badge}. ${videoDurationRangeLabel(item)}`} onPress={()=>setRouteId(item.id)} style={[styles.route,item.id===routeId&&styles.routeSelected]}><View style={styles.routeTop}><Text style={styles.routeName}>{item.displayName}</Text><View style={styles.routeBadges}>{item.badge?<Text style={styles.routeBadge}>{item.badge}</Text>:null}{item.id===routeId?<Check size={15} color={colors.rose}/>:null}</View></View><Text style={styles.routeCopy}>{item.description} · {videoDurationRangeLabel(item)}</Text></Pressable>)}</View>
                <Text style={styles.label}>DESCRIBE THE VIDEO</Text>
                <TextInput testID="direct-video-prompt" accessibilityLabel="Describe the video you want" value={description} onChangeText={setDescription} placeholder={`What should ${name} do in this video?`} placeholderTextColor={colors.dimmed} maxLength={400} multiline style={styles.videoInput}/>
                <Text accessibilityLiveRegion="polite" style={styles.promptCount}>{description.length}/400 · Your prompt guides the action while Kivelle keeps the normal identity and location references.</Text>
                <View style={styles.suggestions}>{VIDEO_PROMPTS.map((prompt)=><Pressable key={prompt} onPress={()=>setDescription(prompt)} style={styles.suggestion}><Text style={styles.suggestionText}>{prompt}</Text></Pressable>)}</View>
                <Text style={styles.label}>DURATION</Text>
                <Text style={styles.durationHint}>Choose 10–20 seconds. Longer clips use proportionally more credits.</Text>
                <View accessibilityRole="radiogroup" style={styles.choiceRow}>{route?.allowedDurations.map((duration)=><Choice key={duration} label={`${duration} sec · ${videoCreditCost(route,duration)}`} selected={durationSeconds===duration} onPress={()=>setDurationSeconds(duration)}/>)}</View>
                <Text style={styles.label}>FRAME</Text>
                <View accessibilityRole="radiogroup" style={styles.choiceRow}><Choice label="Portrait 9:16" selected={aspectRatio==='9:16'} onPress={()=>setAspectRatio('9:16')}/><Choice label="Landscape 16:9" selected={aspectRatio==='16:9'} onPress={()=>setAspectRatio('16:9')}/></View>
                <Text style={styles.label}>MOTION</Text>
                <View accessibilityRole="radiogroup" style={styles.choiceRow}>{options.motionPresets.map((preset)=><Choice key={preset.id} label={preset.displayName} selected={motionPreset===preset.id} onPress={()=>setMotionPreset(preset.id)}/>)}</View>
                <View style={styles.priceRow}><View style={styles.price}><KivelleCreditIcon size={20}/><Text style={styles.priceText}>{creditCost} credits</Text></View><Text style={[styles.balance,insufficient&&styles.danger]}>Balance {balance.toLocaleString()}</Text></View>
                {options.activeVideo?<ErrorCopy text="Finish your active video before starting another."/>:null}
                {insufficient?<View style={styles.creditWarning}><Text style={styles.danger}>You need {creditCost-balance} more credits.</Text><Pressable onPress={onBuyCredits}><Text style={styles.buy}>Get credits</Text></Pressable></View>:null}
                {error?<ErrorCopy text={error}/>:null}
                <Pressable testID="create-direct-video" accessibilityRole="button" accessibilityState={{disabled:!canCreate,busy:submitting}} disabled={!canCreate} onPress={()=>void submitVideo()} style={[styles.primary,!canCreate&&styles.disabled]}>{submitting?<ActivityIndicator color="#fff"/>:<Film size={17} color="#fff"/>}<Text style={styles.primaryText}>{submitting?'Starting video…':`Create ${durationSeconds}s video · ${creditCost}`}</Text></Pressable>
              </>:null}
              {!options?.routes.length&&error?<ErrorCopy text={error}/>:null}
            </>}
            <Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Not now</Text></Pressable>
          </ScrollView>
        </FrostedSurface>
      </KeyboardAvoidingView>
    </View>
  </Modal>;
}

function PhotoComposer({name,description,setDescription,onRequest,onSubmit,photoSharingEntitled,onShareLibrary,onTakePhoto,onPhotoSharingUpgrade}:{name:string;description:string;setDescription:(value:string)=>void;onRequest:(request:string)=>void;onSubmit:()=>void;photoSharingEntitled:boolean;onShareLibrary:()=>void;onTakePhoto?:()=>void;onPhotoSharingUpgrade:()=>void}){
  const choose=photoSharingEntitled?onShareLibrary:onPhotoSharingUpgrade,take=photoSharingEntitled?onTakePhoto:onPhotoSharingUpgrade;
  return <>
  <View style={styles.sectionCard}>
    <View style={styles.sectionHeading}><ImagePlus size={18} color={colors.rose}/><View style={{flex:1}}><Text style={styles.sectionTitle}>Share a photo</Text><Text style={styles.sectionCopy}>Let {name} react to a selfie, pet, meal, place, screenshot, outfit, or another moment from your life.</Text></View>{!photoSharingEntitled?<Text style={styles.plusBadge}>Kivelle+</Text>:null}</View>
    <View style={styles.shareActions}><Pressable testID="share-photo-library" accessibilityRole="button" accessibilityLabel="Choose a photo from your library" onPress={choose} style={styles.sharePrimary}><ImagePlus size={17} color="#fff"/><Text style={styles.primaryText}>Choose photo</Text></Pressable>{take?<Pressable testID="share-photo-camera" accessibilityRole="button" accessibilityLabel="Take a photo" onPress={take} style={styles.shareSecondary}><Camera size={17} color={colors.text}/><Text style={styles.shareSecondaryText}>Take photo</Text></Pressable>:null}</View>
    <Text style={styles.privateCopy}>One photo per message · Private · Originals expire after 30 days</Text>
  </View>
  <View style={styles.createDivider}><View style={styles.dividerLine}/><View style={styles.createLabel}><Sparkles size={13} color="#C7A6FF"/><Text style={styles.createLabelText}>CREATE AN IMAGE</Text><KivelleCreditIcon size={15}/></View><View style={styles.dividerLine}/></View>
  <Text style={styles.copy}>Ask {name} for a generated photo grounded in where they are and what they’re doing right now.</Text>
  <Text style={styles.label}>PRICE SHOWN BEFORE GENERATION</Text>
  <Pressable accessibilityLabel={`Ask ${name} for a selfie`} onPress={()=>onRequest('Send me a selfie from where you are.')} style={styles.primary}><Sparkles size={17} color="#fff"/><Text style={styles.primaryText}>Send me a selfie</Text></Pressable>
  <Text style={styles.label}>OR SHOW ME</Text>
  <View style={styles.photoOptions}>{PHOTO_OPTIONS.map((option)=><Pressable key={option.label} onPress={()=>onRequest(option.request)} style={styles.photoOption}><Camera size={14} color="#C7A6FF"/><Text style={styles.photoOptionText}>{option.label}</Text></Pressable>)}</View>
  <Text style={styles.label}>DESCRIBE WHAT YOU WANT</Text>
  <View style={styles.descriptionRow}><TextInput accessibilityLabel="Describe the exact photo you want" value={description} onChangeText={setDescription} onSubmitEditing={onSubmit} placeholder="Describe what you want…" placeholderTextColor={colors.dimmed} maxLength={320} returnKeyType="send" style={styles.descriptionInput}/><Pressable accessibilityRole="button" accessibilityLabel={`Ask ${name} for this photo`} accessibilityState={{disabled:!description.trim()}} disabled={!description.trim()} onPress={onSubmit} style={[styles.descriptionSubmit,!description.trim()&&styles.disabled]}><Send size={17} color="#fff"/></Pressable></View>
</>}
function Choice({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}){return <Pressable accessibilityRole="radio" accessibilityState={{selected}} onPress={onPress} style={[styles.choice,selected&&styles.choiceSelected]}><Text style={[styles.choiceText,selected&&styles.choiceTextSelected]}>{label}</Text></Pressable>}
function ErrorCopy({text}:{text:string}){return <View style={styles.error}><Text style={styles.danger}>{text}</Text></View>}

const styles=StyleSheet.create({backdrop:{flex:1,alignItems:'center',justifyContent:'center',padding:20},frame:{width:'100%',maxWidth:560,maxHeight:'94%'},modal:{width:'100%',maxHeight:'100%',borderRadius:radius.xl,borderColor:'rgba(201,168,255,.28)',backgroundColor:'rgba(28,21,39,.88)',shadowColor:'#7A42E8',shadowOpacity:.3,shadowRadius:28,shadowOffset:{width:0,height:14},overflow:'hidden'},close:{position:'absolute',zIndex:3,right:14,top:14,width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.06)'},modeToggle:{marginTop:16,marginHorizontal:64,padding:4,borderRadius:radius.pill,flexDirection:'row',backgroundColor:'rgba(7,5,12,.55)',borderWidth:1,borderColor:'rgba(203,168,255,.20)'},modeOption:{flex:1,minHeight:44,borderRadius:radius.pill,flexDirection:'row',gap:7,alignItems:'center',justifyContent:'center'},modeSelected:{backgroundColor:'#7545F5',shadowColor:'#8F5BFF',shadowOpacity:.35,shadowRadius:10},modeText:{color:colors.muted,fontWeight:'800'},modeTextSelected:{color:'#fff'},scroll:{alignItems:'center',paddingHorizontal:28,paddingTop:20,paddingBottom:22},portrait:{width:82,height:82,borderRadius:41,alignItems:'center',justifyContent:'center',overflow:'hidden',marginBottom:16,backgroundColor:colors.elevated,borderWidth:1,borderColor:'rgba(255,255,255,.16)'},title:{fontFamily:'Georgia',fontSize:28,color:colors.text,textAlign:'center'},sectionCard:{width:'100%',marginTop:18,padding:14,borderRadius:radius.lg,backgroundColor:'rgba(239,82,137,.075)',borderWidth:1,borderColor:'rgba(239,82,137,.23)'},sectionHeading:{flexDirection:'row',alignItems:'flex-start',gap:10},sectionTitle:{color:colors.text,fontSize:16,fontWeight:'900'},sectionCopy:{color:colors.textSecondary,fontSize:12,lineHeight:18,marginTop:3},plusBadge:{color:'#FFADCA',fontSize:10,fontWeight:'900',paddingHorizontal:8,paddingVertical:4,borderRadius:radius.pill,backgroundColor:'rgba(239,82,137,.13)'},shareActions:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:13},sharePrimary:{flex:1,minWidth:140,minHeight:48,borderRadius:radius.md,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#D63D78'},shareSecondary:{flex:1,minWidth:125,minHeight:48,borderRadius:radius.md,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'rgba(255,255,255,.065)',borderWidth:1,borderColor:'rgba(255,255,255,.13)'},shareSecondaryText:{color:colors.text,fontSize:13,fontWeight:'900'},privateCopy:{color:colors.dimmed,fontSize:10,lineHeight:15,marginTop:10,textAlign:'center'},createDivider:{width:'100%',flexDirection:'row',alignItems:'center',gap:9,marginTop:20},dividerLine:{flex:1,height:1,backgroundColor:'rgba(203,168,255,.16)'},createLabel:{flexDirection:'row',alignItems:'center',gap:6},createLabelText:{color:'#C7A6FF',fontSize:9,fontWeight:'900',letterSpacing:1.1},copy:{maxWidth:430,color:colors.textSecondary,fontSize:14,lineHeight:21,textAlign:'center',marginTop:9,marginBottom:8},label:{alignSelf:'flex-start',color:colors.dimmed,fontSize:9,fontWeight:'900',letterSpacing:1.2,marginTop:18,marginBottom:8},primary:{width:'100%',minHeight:54,borderRadius:radius.md,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,backgroundColor:'#7545F5',borderWidth:1,borderColor:'rgba(255,255,255,.2)'},primaryText:{color:'#fff',fontSize:14,fontWeight:'900'},disabled:{opacity:.42},photoOptions:{width:'100%',flexDirection:'row',flexWrap:'wrap',gap:8},photoOption:{flex:1,minWidth:125,minHeight:44,paddingHorizontal:11,borderRadius:radius.md,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,backgroundColor:'rgba(255,255,255,.055)',borderWidth:1,borderColor:'rgba(203,168,255,.16)'},photoOptionText:{color:colors.text,fontSize:10,fontWeight:'800',textAlign:'center'},descriptionRow:{width:'100%',flexDirection:'row',alignItems:'center',gap:8},descriptionInput:{flex:1,minWidth:0,minHeight:46,paddingHorizontal:13,borderRadius:radius.md,color:colors.text,fontSize:13,backgroundColor:'rgba(7,5,12,.52)',borderWidth:1,borderColor:'rgba(203,168,255,.24)'},descriptionSubmit:{width:46,height:46,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:'#7545F5'},loading:{minHeight:100,alignItems:'center',justifyContent:'center',gap:8},muted:{color:colors.muted,fontSize:12},referenceCard:{width:'100%',marginTop:10,padding:12,borderRadius:radius.md,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'rgba(117,69,245,.10)',borderWidth:1,borderColor:'rgba(199,166,255,.20)'},referenceText:{flex:1,color:colors.textSecondary,fontSize:12},routeList:{width:'100%',gap:8},route:{padding:12,borderRadius:radius.md,borderWidth:1,borderColor:'rgba(203,168,255,.16)',backgroundColor:'rgba(255,255,255,.04)'},routeSelected:{borderColor:'rgba(216,62,234,.65)',backgroundColor:'rgba(96,29,108,.22)'},routeTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},routeBadges:{flexDirection:'row',alignItems:'center',gap:7},routeBadge:{color:'#FFBBD2',fontSize:9,fontWeight:'900',textTransform:'uppercase'},routeName:{color:colors.text,fontWeight:'900'},routeCopy:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:4},videoInput:{width:'100%',minHeight:94,maxHeight:150,padding:13,borderRadius:radius.md,color:colors.text,fontSize:14,textAlignVertical:'top',backgroundColor:'rgba(7,5,12,.52)',borderWidth:1,borderColor:'rgba(203,168,255,.24)'},promptCount:{width:'100%',color:colors.dimmed,fontSize:10,lineHeight:15,marginTop:6},durationHint:{width:'100%',color:colors.muted,fontSize:10,lineHeight:15,marginTop:-3,marginBottom:8},suggestions:{width:'100%',flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:8},suggestion:{paddingHorizontal:10,paddingVertical:7,borderRadius:radius.pill,borderWidth:1,borderColor:'rgba(203,168,255,.16)',backgroundColor:'rgba(255,255,255,.035)'},suggestionText:{color:colors.textSecondary,fontSize:10,fontWeight:'700'},choiceRow:{width:'100%',flexDirection:'row',flexWrap:'wrap',gap:8},choice:{minHeight:44,paddingHorizontal:14,borderRadius:radius.pill,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(203,168,255,.18)',backgroundColor:'rgba(255,255,255,.04)'},choiceSelected:{borderColor:'#A66CFF',backgroundColor:'rgba(117,69,245,.25)'},choiceText:{color:colors.textSecondary,fontSize:12,fontWeight:'800'},choiceTextSelected:{color:'#fff'},priceRow:{width:'100%',marginTop:18,padding:12,borderRadius:radius.md,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderWidth:1,borderColor:'rgba(203,168,255,.18)'},price:{flexDirection:'row',alignItems:'center',gap:7},priceText:{color:colors.text,fontWeight:'900'},balance:{color:colors.textSecondary,fontSize:12,fontWeight:'800'},danger:{color:colors.danger,fontSize:12,fontWeight:'700'},creditWarning:{width:'100%',marginTop:9,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},buy:{color:colors.rose,fontWeight:'900',fontSize:12},error:{width:'100%',marginTop:10,padding:10,borderRadius:radius.md,backgroundColor:'rgba(255,113,129,.10)',borderWidth:1,borderColor:'rgba(255,113,129,.22)'},cancel:{paddingHorizontal:18,paddingTop:17,paddingBottom:2},cancelText:{color:colors.muted,fontSize:12,fontWeight:'700'}});
