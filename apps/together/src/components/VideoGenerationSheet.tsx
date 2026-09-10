import { VideoCreateFooter } from './VideoCreateFooter';
import { videoCreateDisabledReason, videoPromptIdeas, VIDEO_ACCENT } from '../lib/videoCreator';
import { cachedVideoOptions } from '../lib/videoCatalog';
import { VideoSettingsControls } from './VideoSettingsControls';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { enhanceVideoPrompt, getVideoGenerationOptions } from '../lib/api';
import { canSubmitVideoSelection, loadVideoSelection, normalizedVideoSelection, preferredVideoRouteId, saveVideoSelection, videoComparisonQuote, videoCreditCost } from '../lib/videoGeneration';
import { colors, radius, spacing } from '../theme';
import type { VideoDurationSeconds, VideoGenerationOptions, VideoResolution, VideoRouteOption } from '../types';
import { FrostedBackdrop } from './FrostedGlass';
import { subscriptionHref } from '../lib/subscriptionPresentation';
import { navigateLocalRouteOnWeb } from '../lib/conversationNavigation';
import { VideoModelPicker } from './VideoModelPicker';
import { VideoPromptField } from './VideoPromptField';
import { createClientRequestId } from '../lib/requestId';

type Props={
  visible:boolean;
  sourceMediaId:string;
  sourceUrl:string;
  characterName?:string;
  requestId:string;
  initialOptions?:VideoGenerationOptions|null;
  submitting:boolean;
  error?:string|null;
  onCancel:()=>void;
  onConfirm:(input:{routeId:string;durationSeconds:VideoDurationSeconds;resolution:VideoResolution;sound:boolean;prompt:string;requestId:string;expectedCredits:number})=>void;
  onEvent?:(event:'model_selected',routeId?:string)=>void;
};

export function VideoGenerationSheet({visible,sourceMediaId,sourceUrl,characterName,requestId,initialOptions,submitting,error,onCancel,onConfirm,onEvent}:Props){
  const touched=useRef(false),standardSound=useRef(false);
  const[options,setOptions]=useState<VideoGenerationOptions|null>(initialOptions??cachedVideoOptions()),[loading,setLoading]=useState(false),[contentReady,setContentReady]=useState(true),[loadError,setLoadError]=useState<string|null>(null),[reloadKey,setReloadKey]=useState(0),[routeId,setRouteId]=useState('tier:standard'),[durationSeconds,setDurationSeconds]=useState<VideoDurationSeconds>(5),[resolution,setResolution]=useState<VideoResolution>('720p'),[sound,setSound]=useState(false),[prompt,setPrompt]=useState('');
  useEffect(()=>{if(!visible){setPrompt('');touched.current=false;}},[sourceMediaId,visible]);
  useEffect(()=>{setOptions(initialOptions??cachedVideoOptions());if(initialOptions){setLoading(false);setLoadError(null);setRouteId((current)=>preferredVideoRouteId(initialOptions,current));}},[initialOptions,sourceMediaId]);
  useEffect(()=>{if(!visible){setContentReady(false);return;}const frame=requestAnimationFrame(()=>setContentReady(true));return()=>cancelAnimationFrame(frame);},[visible]);
  useEffect(()=>{if(!visible||!sourceMediaId||initialOptions)return;let active=true;setLoading(true);setLoadError(null);void getVideoGenerationOptions(sourceMediaId).then((value)=>{if(!active)return;setOptions(value);setRouteId((current)=>preferredVideoRouteId(value,current));}).catch((cause)=>{if(active)setLoadError(cause instanceof Error?cause.message:'Video options could not be loaded.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[initialOptions,reloadKey,sourceMediaId,visible]);
  const route=useMemo(()=>options?.routes.find((item)=>item.id===routeId)??null,[options,routeId]);
  useEffect(()=>{if(!options)return;let active=true;void loadVideoSelection().then((stored)=>{if(!active)return;const selected=normalizedVideoSelection(options,stored,routeId);if(!selected||touched.current)return;standardSound.current=Boolean(selected.standardSound);setRouteId(selected.routeId);setResolution(selected.resolution);setDurationSeconds(selected.duration);setSound(selected.sound);});return()=>{active=false;};},[options]);
  useEffect(()=>{if(!route)return;if(!route.allowedDurations.includes(durationSeconds))setDurationSeconds(route.durationSeconds);if(!route.supportedResolutions.includes(resolution))setResolution(route.resolution);if(['none','reference_only'].includes(route.audioMode)&&sound)setSound(false);if(route.audioMode==='always'&&!sound)setSound(true);},[durationSeconds,resolution,route,sound]);
  useEffect(()=>{if(visible&&route&&touched.current)void saveVideoSelection({routeId:route.id,resolution,duration:durationSeconds,sound,standardSound:standardSound.current});},[durationSeconds,resolution,route,sound,visible]);
  const selectRoute=(item:VideoRouteOption)=>{touched.current=true;const quote=videoComparisonQuote(item,{resolution,duration:durationSeconds,sound:standardSound.current});setRouteId(item.id);setResolution(quote.resolution);setDurationSeconds(quote.duration);setSound(quote.sound);onEvent?.('model_selected',item.id);};
  const normalizedPrompt=prompt.trim(),promptReady=normalizedPrompt.length>=2,balance=Number(options?.creditBalance??0),creditCost=route?videoCreditCost(route,durationSeconds,resolution,sound):0,insufficient=Boolean(options?.available&&route&&balance<creditCost),blocked=Boolean(options?.activeVideo),canSubmit=contentReady&&options?.available&&promptReady&&canSubmitVideoSelection({route,durationSeconds,resolution,sound,balance,loading,submitting,hasActiveVideo:blocked});
  const disabledReason=videoCreateDisabledReason({submitting,loading:loading||!contentReady,available:!!options?.available,activeVideo:blocked,insufficient,prompt,validSettings:!!route&&Number.isFinite(creditCost)});
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
    <View accessibilityViewIsModal style={styles.root}>
      <FrostedBackdrop intensity={48}/>
      <Pressable accessibilityLabel="Cancel video" onPress={onCancel} style={StyleSheet.absoluteFill}/>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':Platform.OS==='android'?'height':undefined} style={promptStyles.frame}>
      <View style={[styles.sheet,compactStyles.sheet]}>
        <View style={styles.header}>
          <Image source={{uri:sourceUrl}} style={compactStyles.thumb} contentFit="cover"/><View style={{flex:1}}><Text accessibilityRole="header" style={compactStyles.title}>Bring this moment to life</Text><Text style={styles.subtitle}>{characterName?`with ${characterName}`:'Animate your photo'}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close video options" onPress={onCancel} style={styles.close}><X size={20} color={colors.textSecondary}/></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={compactStyles.context}>Uses this photo’s appearance, location, and framing.</Text>
          {!contentReady||loading?<View style={compactStyles.loading}><ActivityIndicator color={VIDEO_ACCENT}/><Text style={styles.secondary}>{contentReady?'Checking account availability…':'Opening video settings…'}</Text></View>:null}
          {contentReady&&loadError?<View><ErrorCopy message={loadError}/><Pressable accessibilityRole="button" accessibilityLabel="Retry loading video options" onPress={()=>setReloadKey((value)=>value+1)} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View>:null}
          {contentReady&&!loading&&options&&!options.available&&!options.routes.length?<ErrorCopy message="Video is not available for this photo or account."/>:null}
          {contentReady&&options?.routes.length?<>
            <Text style={compactStyles.label}>What happens in this moment?</Text>
            <VideoPromptField testID="bring-to-life-prompt" value={prompt} onChange={setPrompt} disabled={submitting||!route} placeholder="What should happen in this video?" suggestions={videoPromptIdeas(characterName?{name:characterName}:undefined,'',true)} onEnhance={async(draft)=>{if(!route)throw new Error('Choose a video model first.');const result=await enhanceVideoPrompt({sourceMode:'existing_photo',sourceMediaId,routeId:route.id,settings:{model:route.id,sound,resolution,duration:durationSeconds},aspectRatio:options.sourceAspectRatio??'9:16',locationSource:'current',prompt:draft,requestId:createClientRequestId()});return result.prompt;}}/>
            <Text style={compactStyles.label}>Video quality</Text>
            <VideoModelPicker routes={options.routes} selectedRouteId={routeId} duration={durationSeconds} resolution={resolution} sound={standardSound.current} disabled={submitting} onSelect={selectRoute}/>
            {route?<VideoSettingsControls route={route} resolution={resolution} duration={durationSeconds} sound={sound} onResolution={(v)=>{touched.current=true;setResolution(v);}} onDuration={(v)=>{touched.current=true;setDurationSeconds(v);}} onSound={(v)=>{touched.current=true;standardSound.current=v;setSound(v);}} disabled={submitting} sourceFrame={options.sourceAspectRatio==='16:9'?'Landscape (photo)':options.sourceAspectRatio==='9:16'?'Portrait (photo)':'Photo frame'}/>:null}
            {error?<ErrorCopy message={error}/>:null}
          </>:null}
        </ScrollView>
        <View style={compactStyles.footer}><VideoCreateFooter testID="create-bring-to-life-video" cost={creditCost} balance={loading?null:options?.creditBalance??null} disabledReason={disabledReason??(!canSubmit?'Choose supported video settings.':null)} submitting={submitting} onCreate={()=>route&&onConfirm({routeId:route.id,durationSeconds,resolution,sound,prompt:normalizedPrompt,requestId,expectedCredits:creditCost})} onBuyCredits={()=>{onCancel();const href=subscriptionHref({intent:'credits'});if(Platform.OS!=='web'||!navigateLocalRouteOnWeb(href))router.push(href as never);}}/></View>
      </View>
      </KeyboardAvoidingView>
    </View>
  </Modal>;
}

function ErrorCopy({message}:{message:string}){return <View style={styles.error}><Text style={styles.dangerText}>{message}</Text></View>}

const promptStyles=StyleSheet.create({frame:{width:'100%',maxWidth:720,maxHeight:'100%'}});

const styles=StyleSheet.create({root:{flex:1,justifyContent:'flex-end',padding:Platform.OS==='web'?spacing.xl:0,alignItems:'center'},sheet:{width:'100%',maxWidth:720,maxHeight:Platform.OS==='web'?'92%':'94%',borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,...(Platform.OS==='web'?{borderBottomLeftRadius:radius.xl,borderBottomRightRadius:radius.xl}:{}),overflow:'hidden'},header:{padding:spacing.lg,paddingBottom:12,flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:12,borderBottomWidth:1,borderBottomColor:colors.border},title:{color:colors.text,fontFamily:'Georgia',fontSize:27,fontWeight:'700'},subtitle:{color:colors.textSecondary,marginTop:5},close:{width:44,height:44,borderRadius:22,backgroundColor:'rgba(255,255,255,.06)',alignItems:'center',justifyContent:'center'},scroll:{padding:spacing.lg,paddingBottom:12},poster:{width:'100%',height:190,borderRadius:radius.lg,backgroundColor:colors.surface},loading:{minHeight:120,alignItems:'center',justifyContent:'center',gap:10},secondary:{color:colors.textSecondary},retry:{alignSelf:'flex-start',minHeight:44,justifyContent:'center',paddingHorizontal:16,marginTop:9,borderRadius:radius.pill,borderWidth:1,borderColor:colors.borderBright,backgroundColor:'rgba(255,255,255,.06)'},retryText:{color:colors.text,fontWeight:'900'},sectionTitle:{color:colors.text,fontSize:14,fontWeight:'900',marginTop:18,marginBottom:9,textTransform:'uppercase',letterSpacing:1.2},modelGroup:{marginTop:10},groupTitle:{color:colors.muted,fontSize:10,fontWeight:'900',letterSpacing:1.1,textTransform:'uppercase',marginBottom:7},routeList:{gap:10},route:{borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:15,backgroundColor:'rgba(7,7,12,.44)',gap:7},routeSelected:{borderColor:'rgba(216,62,234,.68)',backgroundColor:'rgba(96,29,108,.26)'},routeHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},routeHeaderActions:{flexDirection:'row',alignItems:'center',gap:9},routeName:{color:colors.text,fontSize:17,fontWeight:'900',flex:1},modelPrice:{minHeight:30,paddingHorizontal:9,borderRadius:radius.pill,flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'rgba(216,62,234,.15)',borderWidth:1,borderColor:'rgba(216,62,234,.34)'},modelPriceValue:{color:colors.cream,fontSize:13,fontWeight:'900'},modelPriceSummary:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'},modelPriceLabel:{color:colors.rose,fontSize:9,fontWeight:'900',letterSpacing:.8},modelPriceSettings:{color:colors.muted,fontSize:11,fontWeight:'700'},endpoint:{color:colors.dimmed,fontSize:10,fontFamily:Platform.OS==='web'?'monospace':undefined},badgeRow:{flexDirection:'row',flexWrap:'wrap',gap:6},badge:{paddingHorizontal:9,paddingVertical:5,borderRadius:radius.pill,backgroundColor:'rgba(216,62,234,.15)',borderWidth:1,borderColor:'rgba(216,62,234,.32)'},badgeText:{color:colors.cream,fontSize:10,fontWeight:'900'},routeDescription:{color:colors.textSecondary,lineHeight:19},specRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'},spec:{color:colors.muted,fontSize:12},inline:{flexDirection:'row',alignItems:'center',gap:5},warning:{color:colors.amber,fontSize:12,lineHeight:17},motionList:{flexDirection:'row',gap:8,flexWrap:'wrap'},motion:{flexGrow:1,flexBasis:170,minHeight:92,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:12,backgroundColor:'rgba(7,7,12,.38)'},motionSelected:{borderColor:'rgba(216,62,234,.62)',backgroundColor:'rgba(96,29,108,.22)'},motionTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},motionName:{color:colors.text,fontWeight:'900'},motionDescription:{color:colors.muted,fontSize:12,lineHeight:17,marginTop:6},durationHint:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:-3,marginBottom:8},durationList:{flexDirection:'row',gap:8,flexWrap:'wrap'},duration:{minWidth:92,minHeight:44,paddingHorizontal:14,borderRadius:radius.pill,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.035)'},durationSelected:{borderColor:colors.rose,backgroundColor:'rgba(216,62,234,.16)'},durationText:{color:colors.textSecondary,fontWeight:'800'},durationTextSelected:{color:colors.cream},output:{marginTop:18,padding:14,borderRadius:radius.md,backgroundColor:'rgba(155,99,215,.09)',borderWidth:1,borderColor:'rgba(155,99,215,.20)'},outputTitle:{flexDirection:'row',alignItems:'center',gap:7},outputHeading:{color:colors.text,fontWeight:'900'},outputText:{color:colors.textSecondary,fontSize:12,lineHeight:18,marginTop:6},balanceRow:{marginTop:16,padding:14,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},priceLabel:{color:colors.muted,fontSize:11,fontWeight:'800',textTransform:'uppercase',letterSpacing:.7},price:{flexDirection:'row',alignItems:'center',gap:8,marginTop:5},priceValue:{color:colors.text,fontWeight:'900',fontSize:17},balanceCopy:{alignItems:'flex-end'},balance:{color:colors.text,fontSize:19,fontWeight:'900',marginTop:3},danger:{color:colors.danger},insufficient:{marginTop:10,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},buy:{color:colors.rose,fontWeight:'900'},error:{marginTop:12,padding:12,borderRadius:radius.md,backgroundColor:'rgba(255,113,129,.10)',borderWidth:1,borderColor:'rgba(255,113,129,.22)'},dangerText:{color:colors.danger,fontSize:13,fontWeight:'700'},footer:{padding:spacing.lg,paddingTop:12,borderTopWidth:1,borderTopColor:colors.border,flexDirection:'row',gap:10},cancel:{minHeight:50,paddingHorizontal:18,borderRadius:radius.pill,borderWidth:1,borderColor:colors.borderBright,alignItems:'center',justifyContent:'center'},cancelText:{color:colors.textSecondary,fontWeight:'800'},confirm:{minHeight:50,flex:1,borderRadius:radius.pill,backgroundColor:colors.rose,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8},confirmText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.42}});

const compactStyles=StyleSheet.create({sheet:{borderWidth:1,borderColor:colors.border,borderRadius:20,backgroundColor:'#19151F'},thumb:{width:48,height:48,borderRadius:12},title:{fontFamily:'Georgia',fontSize:23,color:colors.text},context:{color:colors.textSecondary,fontSize:12,lineHeight:18},label:{color:colors.text,fontSize:13,fontWeight:'600',marginTop:14,marginBottom:9},loading:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:10},footer:{paddingHorizontal:20,paddingBottom:18}});
