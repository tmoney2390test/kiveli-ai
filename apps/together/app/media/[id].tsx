import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as Crypto from 'expo-crypto';
import { useVideoPlayer, VideoView } from 'expo-video';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2, RefreshCw, Sparkles, Trash2, Volume2, VolumeX, WandSparkles, X } from 'lucide-react-native';
import { ErrorState, FrostedBackdrop, FrostedSurface, ImageLightbox, LoadingSkeleton, MediaFeedbackControls, VideoGenerationSheet, VideoLightbox, WebVideoSurface } from '../../src/components';
import { colors, radius, spacing } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { animateMedia, editGeneratedMedia, getVideoDiagnostics, getVideoGenerationOptions, manageMedia, recordVideoPlayback, submitVideoFeedback, trackVideoSelectorEvent } from '../../src/lib/api';
import { confirmAction } from '../../src/lib/dialogs';
import type { GeneratedMedia, VideoDiagnostics, VideoGenerationOptions,VideoResolution } from '../../src/types';
import { generatedMediaImageSource } from '../../src/lib/mediaImageSource';
import { resolveMediaCarousel, type MediaCarouselMode } from '../../src/lib/mediaCarousel';
import { containedMediaFrame, fixedMediaFrameStyle, mediaAspectRatio, resolveAssociatedVideoAction, shouldPollVideoAvailability, shouldRefreshReadyVideo } from '../../src/lib/mediaViewer';
import { privateMediaPlaybackUrl } from '../../src/lib/privateMediaUrl';
import { supabaseUrl } from '../../src/lib/supabase';
import { conversationReturnHref, mediaViewerHref, navigateLocalRouteOnWeb } from '../../src/lib/conversationNavigation';
import { mediaRouteFailureState, resolveMediaRoutePresentation, type MediaRouteRecovery } from '../../src/lib/mediaRouteRecovery';

const EDIT_SUGGESTIONS=['Fix the face','Fix the hands','Change the outfit','Change the pose','Adjust the lighting','Reframe the photo'];

export default function MediaViewer(){
  const {id:routeId,gallery,character:galleryCharacter,returnTo}=useLocalSearchParams<{id:string|string[];gallery?:MediaCarouselMode;character?:string;returnTo?:string}>(),id=Array.isArray(routeId)?routeId[0]:routeId;
  const{snapshot,refresh,removeMedia,upsertMedia}=useTogether();
  const[animating,setAnimating]=useState(false),[removing,setRemoving]=useState(false),[retrying,setRetrying]=useState(false),[photoRefreshing,setPhotoRefreshing]=useState(false),[photoPlaybackError,setPhotoPlaybackError]=useState<string|null>(null),[editOpen,setEditOpen]=useState(false),[lightboxOpen,setLightboxOpen]=useState(false),[videoFullscreenOpen,setVideoFullscreenOpen]=useState(false),[videoOpen,setVideoOpen]=useState(false),[videoRequestId,setVideoRequestId]=useState(''),[videoOptions,setVideoOptions]=useState<VideoGenerationOptions|null>(null),[videoError,setVideoError]=useState<string|null>(null),[videoProgress,setVideoProgress]=useState<string|null>(null),[diagnostics,setDiagnostics]=useState<VideoDiagnostics|null>(null),[editing,setEditing]=useState(false),[instruction,setInstruction]=useState(''),[videoReady,setVideoReady]=useState(false),[videoRefreshing,setVideoRefreshing]=useState(false),[videoPlaybackError,setVideoPlaybackError]=useState<string|null>(null),[videoPlaybackUrl,setVideoPlaybackUrl]=useState<string|null>(null),[videoPosterUrl,setVideoPosterUrl]=useState<string|null>(null),[stageSize,setStageSize]=useState({width:0,height:0}),[routeMediaRecovery,setRouteMediaRecovery]=useState<MediaRouteRecovery|null>(null);
  const playbackRecorded=useRef(false),playbackRefreshRequest=useRef(0),routeMediaRequest=useRef(0),photoAutoRefresh=useRef(false);
  const media=snapshot?.generatedMedia?.find((item)=>item.id===id),character=snapshot?.characters.find((item)=>item.id===media?.character_instance_id);
  const associatedVideo=media?.media_type==='image'?(snapshot?.generatedMedia??[]).filter((item)=>item.media_type==='video'&&item.parent_media_id===media.id).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]:undefined;
  const player=useVideoPlayer(null,(instance)=>{instance.loop=true;instance.muted=true;});
  const recoverRouteMedia=useCallback(async(mediaId:string)=>{
    const request=++routeMediaRequest.current;
    setRouteMediaRecovery({id:mediaId,state:'loading'});
    try{
      const result=await manageMedia<{media:GeneratedMedia}>({action:'status',mediaId});
      if(request!==routeMediaRequest.current)return;
      upsertMedia(result.media);
      setRouteMediaRecovery(null);
    }catch(error){
      if(request!==routeMediaRequest.current)return;
      setRouteMediaRecovery({id:mediaId,state:mediaRouteFailureState(error)});
    }
  },[upsertMedia]);
  useEffect(()=>{
    if(!snapshot||!id||media)return;
    void recoverRouteMedia(id);
  },[id,media?.id,recoverRouteMedia,snapshot]);
  const recordPlaybackStarted=useCallback(()=>{
    const mediaId=media?.id;
    if(!mediaId||media?.media_type!=='video'||media.status!=='ready'||playbackRecorded.current)return;
    playbackRecorded.current=true;
    void recordVideoPlayback(mediaId).catch(()=>{playbackRecorded.current=false;});
  },[media?.id,media?.media_type,media?.status]);
  const refreshVideoPlayback=useCallback(async():Promise<string|null>=>{
    const mediaId=media?.id,parentMediaId=media?.parent_media_id;
    if(!mediaId||!shouldRefreshReadyVideo(media))return null;
    const request=++playbackRefreshRequest.current;
    setVideoRefreshing(true);setVideoReady(false);setVideoPlaybackError(null);setVideoPlaybackUrl(null);setVideoPosterUrl(null);
    try{
      const mediaIds=[mediaId,parentMediaId].filter((value):value is string=>Boolean(value));
      const result=await manageMedia<{media:GeneratedMedia[]}>({action:'batch_status',mediaIds});
      if(request!==playbackRefreshRequest.current)return null;
      result.media.forEach(upsertMedia);
      const refreshedVideo=result.media.find((item)=>item.id===mediaId),refreshedPoster=result.media.find((item)=>item.id===parentMediaId);
      const nextUrl=refreshedVideo?.status==='ready'?privateMediaPlaybackUrl(refreshedVideo.signed_url,Platform.OS,supabaseUrl):null;
      if(!nextUrl)throw new Error('The secure video link could not be refreshed.');
      setVideoPlaybackUrl(nextUrl);
      setVideoPosterUrl(privateMediaPlaybackUrl(refreshedPoster?.signed_url,Platform.OS,supabaseUrl));
      return nextUrl;
    }catch{
      if(request===playbackRefreshRequest.current)setVideoPlaybackError('This video could not be loaded. Please try again.');
      return null;
    }finally{
      if(request===playbackRefreshRequest.current)setVideoRefreshing(false);
    }
  },[media?.id,media?.media_type,media?.parent_media_id,media?.status,upsertMedia]);

  useEffect(()=>{
    if(!media||!['queued','generating'].includes(media.status))return;
    let active=true;
    const poll=async()=>{try{const result=await manageMedia<{media:GeneratedMedia;progressState?:string}>({action:'status',mediaId:media.id});if(active){upsertMedia(result.media);setVideoProgress(result.progressState??null);}}catch{/* A later poll can recover without replacing the current generation state. */}};
    const timer=setInterval(()=>void poll(),2500);void poll();
    return()=>{active=false;clearInterval(timer);};
  },[media?.id,media?.status,upsertMedia]);

  useEffect(()=>{
    if(!shouldRefreshReadyVideo(media)){setVideoPlaybackUrl(null);setVideoPosterUrl(null);setVideoPlaybackError(null);return;}
    void refreshVideoPlayback();
    return()=>{playbackRefreshRequest.current+=1;};
  },[refreshVideoPlayback]);

  useEffect(()=>{
    if(Platform.OS==='web')return;
    let active=true;
    setVideoReady(false);
    void player.replaceAsync(videoPlaybackUrl).catch(()=>{if(active&&videoPlaybackUrl)setVideoPlaybackError('This video could not be loaded. Please try again.');});
    return()=>{active=false;};
  },[player,videoPlaybackUrl]);

  useEffect(()=>{
    if(Platform.OS==='web')return;
    const subscription=player.addListener('statusChange',({status})=>{
      if(status==='error'){setVideoReady(false);setVideoPlaybackError('This video could not be loaded. Please try again.');}
      if(status==='readyToPlay')setVideoPlaybackError(null);
    });
    return()=>subscription.remove();
  },[player]);

  useEffect(()=>{
    if(!associatedVideo||!['queued','generating'].includes(associatedVideo.status))return;
    let active=true;
    const poll=async()=>{try{const result=await manageMedia<{media:GeneratedMedia}>({action:'status',mediaId:associatedVideo.id});if(active)upsertMedia(result.media);}catch{/* The next snapshot or poll can recover. */}};
    const timer=setInterval(()=>void poll(),2500);void poll();
    return()=>{active=false;clearInterval(timer);};
  },[associatedVideo?.id,associatedVideo?.status,upsertMedia]);

  useEffect(()=>{
    if(media?.media_type!=='image'||media.status!=='ready')return;
    let active=true,idlePolls=0;
    const poll=async()=>{try{const value=await getVideoGenerationOptions(media.id);if(!active)return;setVideoOptions(value);if(!value.activeVideoId&&!value.latestVideoId)idlePolls+=1;if(!shouldPollVideoAvailability(value)||idlePolls>=12)clearInterval(timer);}catch{if(active&&idlePolls===0)setVideoOptions(null);idlePolls+=1;if(idlePolls>=12)clearInterval(timer);}};
    const timer=setInterval(()=>void poll(),2500);void poll();
    return()=>{active=false;clearInterval(timer);};
  },[media?.id,media?.media_type,media?.status]);
  useEffect(()=>{if(media?.media_type!=='video')return;let active=true;void getVideoDiagnostics(media.id).then((value)=>{if(active)setDiagnostics(value.diagnostics);}).catch(()=>undefined);return()=>{active=false;};},[media?.id,media?.media_type,media?.status]);
  useEffect(()=>{playbackRecorded.current=false;if(Platform.OS==='web'||media?.media_type!=='video'||media.status!=='ready')return;const subscription=player.addListener('playingChange',({isPlaying})=>{if(isPlaying)recordPlaybackStarted();});return()=>subscription.remove();},[media?.id,media?.media_type,media?.status,player,recordPlaybackStarted]);
  useEffect(()=>{if(videoFullscreenOpen)player.pause();},[player,videoFullscreenOpen]);
  useEffect(()=>setPhotoPlaybackError(null),[media?.id,media?.signed_url]);

  const carousel=resolveMediaCarousel({media:snapshot?.generatedMedia??[],current:media,mode:gallery==='moments'?'moments':'auto',characterInstanceId:galleryCharacter});
  const conversationReturnTo=conversationReturnHref(returnTo);
  const mediaHref=(mediaId:string)=>{
    const href=mediaViewerHref(mediaId,conversationReturnTo);
    if(gallery!=='moments')return href;
    return `${href}${href.includes('?')?'&':'?'}gallery=moments&character=${encodeURIComponent(galleryCharacter??'all')}`;
  };
  const navigateMedia=(mediaId:string,mode:'push'|'replace'='push')=>{
    const href=mediaHref(mediaId);
    if(Platform.OS==='web'&&navigateLocalRouteOnWeb(href,mode))return;
    if(mode==='replace')router.replace(href as never);else router.push(href as never);
  };
  const goBack=()=>{
    if(conversationReturnTo){
      if(Platform.OS==='web'&&navigateLocalRouteOnWeb(conversationReturnTo,'replace'))return;
      router.replace(conversationReturnTo as never);
      return;
    }
    if(router.canGoBack()){router.back();return;}
    if(Platform.OS==='web'&&navigateLocalRouteOnWeb('/moments','replace'))return;
    router.replace('/moments');
  };
  const openCarouselMedia=(mediaId:string)=>{
    navigateMedia(mediaId,'replace');
  };
  useEffect(()=>{
    if(Platform.OS!=='web'||lightboxOpen||editOpen)return;
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='ArrowLeft'&&carousel.previous){event.preventDefault();openCarouselMedia(carousel.previous.id);}
      if(event.key==='ArrowRight'&&carousel.next){event.preventDefault();openCarouselMedia(carousel.next.id);}
    };
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[carousel.next?.id,carousel.previous?.id,editOpen,gallery,galleryCharacter,lightboxOpen]);

  useEffect(()=>{photoAutoRefresh.current=false;setPhotoPlaybackError(null);},[media?.id,media?.signed_url]);
  const routePresentation=resolveMediaRoutePresentation({routeId:id,snapshotReady:Boolean(snapshot),mediaId:media?.id,recovery:routeMediaRecovery});
  if(routePresentation==='loading')return <LoadingSkeleton label="Opening the photo…"/>;
  if(!media){
    const missing=routePresentation==='missing';
    return <ErrorState message={missing?'This photo is no longer part of your story.':'This photo could not be reopened securely.'} onRetry={missing||!id?undefined:()=>void recoverRouteMedia(id)}/>;
  }
  const metadata=media.metadata??{},editDepth=Math.max(0,Number(metadata.editDepth??0)),versionLabel=editDepth?`Edit ${editDepth}`:'Original';
  const retry=async()=>{if(retrying)return;setRetrying(true);try{const result=await manageMedia<{media:GeneratedMedia}>({action:'retry',mediaId:media.id});upsertMedia(result.media);}catch(error){Alert.alert('Could not retry photo',error instanceof Error?error.message:'Please try again.');}finally{setRetrying(false);}};
  const refreshPhoto=async()=>{if(photoRefreshing)return;setPhotoRefreshing(true);try{const result=await manageMedia<{media:GeneratedMedia}>({action:'status',mediaId:media.id});upsertMedia(result.media);setPhotoPlaybackError(null);}catch(error){setPhotoPlaybackError(error instanceof Error?error.message:'This photo could not be loaded securely.');}finally{setPhotoRefreshing(false);}};
  const remove=()=>confirmAction({title:`Remove this ${media.media_type==='video'?'video':'photo'}?`,message:'It will disappear from your Gallery and any Kivelle history that uses it.',confirmLabel:'Remove',destructive:true,onConfirm:async()=>{if(removing)return;setRemoving(true);try{await manageMedia({action:'remove',mediaId:media.id});removeMedia(media.id);goBack();void refresh();}catch(error){setRemoving(false);Alert.alert('Could not remove media',error instanceof Error?error.message:'Please try again.');}}});
  const openVideo=()=>{
    setVideoError(null);
    setVideoRequestId((value)=>value||Crypto.randomUUID());
    setVideoOpen(true);
    setTimeout(()=>void trackVideoSelectorEvent(media.id,'option_sheet_opened').catch(()=>undefined),0);
  };
  const animate=async(input:{routeId:string;durationSeconds:number;resolution:VideoResolution;sound:boolean;prompt:string;requestId:string})=>{if(animating)return;setAnimating(true);setVideoError(null);try{const result=await animateMedia(media.id,{model:input.routeId,sound:input.sound,resolution:input.resolution,duration:input.durationSeconds},input.prompt,input.requestId);upsertMedia(result.media);setVideoOpen(false);navigateMedia(result.media.id,'replace');}catch(error){setVideoError(error instanceof Error?error.message:'The video could not be started.');}finally{setAnimating(false);}};
  const edit=async()=>{const requested=instruction.trim();if(!requested||editing)return;setEditing(true);try{const result=await editGeneratedMedia(media.id,Crypto.randomUUID(),requested);upsertMedia(result.media);setEditOpen(false);setInstruction('');navigateMedia(result.media.id,'replace');}catch(error){Alert.alert('Edit unavailable',error instanceof Error?error.message:'Please try again.');}finally{setEditing(false);}};
  const viewParent=()=>{if(media.parent_media_id)navigateMedia(media.parent_media_id);};
  const openVideoFullscreen=async()=>{if(videoRefreshing)return;const freshUrl=await refreshVideoPlayback();if(freshUrl)setVideoFullscreenOpen(true);};
  const videoRatio=media.media_type==='video'?mediaAspectRatio(media):1,videoFrame=containedMediaFrame(stageSize,videoRatio,spacing.md,1100);
  const videoFrameStyle=media.media_type==='video'&&media.status==='ready'?fixedMediaFrameStyle(videoFrame):undefined;
  const videoAction=media.media_type==='image'?resolveAssociatedVideoAction(associatedVideo,videoOptions):null;
  const videoAudioBehavior=media.actual_audio_behavior??diagnostics?.actualAudioBehavior??'unknown';

  return <View style={styles.screen}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel={conversationReturnTo?'Back to conversation':'Go back'} onPress={goBack} style={styles.icon}><ArrowLeft color={colors.text}/></Pressable><View style={styles.headerCopy}><Text style={styles.name}>From {character?.together_character_templates.name??'your companion'}</Text><Text style={styles.meta}>{versionLabel} · {new Date(media.created_at).toLocaleString()}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Remove this ${media.media_type==='video'?'video':'photo'}`} disabled={removing} onPress={remove} style={[styles.icon,removing&&styles.disabled]}><Trash2 color={colors.danger}/></Pressable></View>
    <View onLayout={(event)=>setStageSize(event.nativeEvent.layout)} style={styles.stage}><View style={[styles.stageFrame,videoFrameStyle]}>{media.status==='ready'&&(media.media_type==='video'||media.signed_url)?(media.media_type==='video'?<>{Platform.OS==='web'?<WebVideoSurface uri={videoPlaybackUrl} posterUri={videoPosterUrl} accessibilityLabel={`Video from ${character?.together_character_templates.name??'your companion'}`} active={!videoFullscreenOpen} autoPlay={false} muted loop audioBehavior={videoAudioBehavior} onReady={()=>{setVideoReady(true);setVideoPlaybackError(null);}} onError={()=>setVideoPlaybackError('This video could not be loaded. Please try again.')} onRetry={async()=>{await refreshVideoPlayback();}} onPlay={recordPlaybackStarted}/>:<VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls playsInline fullscreenOptions={{enable:true,orientation:'default'}} onFirstFrameRender={()=>setVideoReady(true)}/>} {Platform.OS!=='web'&&videoPlaybackError?<View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.videoLoading}><Text style={styles.playbackErrorTitle}>Video unavailable</Text><Text style={styles.playbackErrorCopy}>{videoPlaybackError}</Text><Pressable accessibilityRole="button" accessibilityLabel="Try loading video again" disabled={videoRefreshing} onPress={()=>void refreshVideoPlayback()} style={[styles.primary,videoRefreshing&&styles.disabled]}>{videoRefreshing?<ActivityIndicator size="small" color="#fff"/>:<RefreshCw size={16} color="#fff"/>}<Text style={styles.primaryText}>{videoRefreshing?'Refreshing…':'Try again'}</Text></Pressable></View>:Platform.OS!=='web'&&!videoReady?<View pointerEvents="none" accessibilityLiveRegion="polite" style={styles.videoLoading}><ActivityIndicator color={colors.rose}/><Text style={styles.meta}>{videoPlaybackUrl?'Loading video…':'Refreshing secure video…'}</Text></View>:null}{videoReady&&(!videoPlaybackError||Platform.OS==='web')?<Pressable accessibilityRole="button" accessibilityLabel="Open full-screen video" disabled={videoRefreshing} onPress={()=>void openVideoFullscreen()} style={[styles.videoFullscreenButton,videoRefreshing&&styles.disabled]}><Maximize2 size={19} color="#fff"/></Pressable>:null}</>:<><Pressable accessibilityRole="imagebutton" accessibilityLabel="Open full-size photo" disabled={Boolean(photoPlaybackError)} onPress={()=>setLightboxOpen(true)} style={StyleSheet.absoluteFill}><Image source={generatedMediaImageSource(media)} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="none" priority="high" recyclingKey={`${media.id}:${media.signed_url??''}`} onError={()=>{if(!photoAutoRefresh.current){photoAutoRefresh.current=true;void refreshPhoto();return;}setPhotoPlaybackError('This photo needs a fresh secure link.');}}/></Pressable>{photoPlaybackError?<View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.videoLoading}><Text style={styles.playbackErrorTitle}>Photo unavailable</Text><Text style={styles.playbackErrorCopy}>{photoPlaybackError}</Text><Pressable accessibilityRole="button" accessibilityLabel="Try loading photo again" disabled={photoRefreshing} onPress={()=>void refreshPhoto()} style={[styles.primary,photoRefreshing&&styles.disabled]}>{photoRefreshing?<ActivityIndicator size="small" color="#fff"/>:<RefreshCw size={16} color="#fff"/>}<Text style={styles.primaryText}>{photoRefreshing?'Refreshing…':'Try again'}</Text></Pressable></View>:null}{carousel.previous?<Pressable accessibilityRole="button" accessibilityLabel="Previous photo" onPress={()=>openCarouselMedia(carousel.previous!.id)} style={({pressed})=>[styles.carouselZone,styles.carouselZoneLeft,pressed&&styles.carouselZonePressed]}><View style={styles.carouselArrow}><ChevronLeft size={25} color="#fff"/></View></Pressable>:null}{carousel.next?<Pressable accessibilityRole="button" accessibilityLabel="Next photo" onPress={()=>openCarouselMedia(carousel.next!.id)} style={({pressed})=>[styles.carouselZone,styles.carouselZoneRight,pressed&&styles.carouselZonePressed]}><View style={styles.carouselArrow}><ChevronRight size={25} color="#fff"/></View></Pressable>:null}{carousel.items.length>1?<View pointerEvents="none" style={styles.carouselCount}><Text style={styles.carouselCountText}>{carousel.index+1} / {carousel.items.length}</Text></View>:null}</>):<View style={styles.state}><Text style={styles.stateTitle}>{media.status==='failed'?`That ${media.media_type==='video'?'video':'photo'} didn’t come through`:media.media_type==='video'?'Bringing the moment to life…':editDepth?'Applying your edit…':'Photo on the way'}</Text><Text style={styles.meta}>{media.failure_reason_safe??'You can keep exploring while it finishes.'}</Text>{media.status==='failed'&&media.media_type==='image'?<Pressable accessibilityRole="button" accessibilityLabel="Retry photo generation" accessibilityState={{disabled:retrying,busy:retrying}} disabled={retrying} onPress={()=>void retry()} style={[styles.primary,retrying&&styles.disabled]}>{retrying?<ActivityIndicator size="small" color="#fff"/>:<RefreshCw size={16} color="#fff"/>}<Text style={styles.primaryText}>{retrying?'Retrying…':'Try again'}</Text></Pressable>:null}{media.status==='failed'&&media.media_type==='video'&&media.parent_media_id?<Pressable accessibilityRole="button" onPress={()=>navigateMedia(media.parent_media_id!,'replace')} style={styles.primary}><Sparkles size={16} color="#fff"/><Text style={styles.primaryText}>Create another video</Text></Pressable>:null}</View>}</View></View>
    {media.media_type==='image'&&media.status==='ready'?<View style={styles.details}><View style={styles.feedbackRow}><MediaFeedbackControls media={media}/>{media.parent_media_id?<Pressable onPress={viewParent}><Text style={styles.originalLink}>View source</Text></Pressable>:null}</View><View style={styles.actionRow}><Pressable onPress={()=>setEditOpen(true)} style={styles.secondary}><WandSparkles size={16} color={colors.rose}/><Text style={styles.secondaryText}>Edit photo</Text></Pressable>{videoAction?<Pressable testID="associated-video-action" accessibilityRole="button" accessibilityLabel={videoAction.label} onPress={()=>navigateMedia(videoAction.mediaId)} style={styles.primary}>{!['ready','failed'].includes(videoAction.status)?<ActivityIndicator size="small" color="#fff"/>:<Sparkles size={16} color="#fff"/>}<Text style={styles.primaryText}>{videoAction.label}</Text></Pressable>:videoOptions?.available!==false?<Pressable testID="bring-to-life-action" accessibilityRole="button" accessibilityLabel="Bring this photo to life" onPress={openVideo} style={styles.primary}><Sparkles size={16} color="#fff"/><Text style={styles.primaryText}>Bring to life</Text></Pressable>:null}</View></View>:null}
    {media.media_type==='video'?<VideoDetails media={media} progressState={videoProgress} diagnostics={diagnostics}/>:null}
    {media.media_type==='image'&&media.signed_url?<ImageLightbox visible={lightboxOpen} source={generatedMediaImageSource(media)??{uri:media.signed_url}} accessibilityLabel={`Photo from ${character?.together_character_templates.name??'your companion'}`} onClose={()=>setLightboxOpen(false)}/>:null}
    {media.media_type==='video'&&media.status==='ready'&&videoPlaybackUrl?<VideoLightbox visible={videoFullscreenOpen} uri={videoPlaybackUrl} posterUri={videoPosterUrl} aspectRatio={videoRatio} audioBehavior={videoAudioBehavior} onClose={()=>setVideoFullscreenOpen(false)}/>:null}
    {media.media_type==='image'&&media.signed_url?<VideoGenerationSheet visible={videoOpen} sourceMediaId={media.id} sourceUrl={media.signed_url} requestId={videoRequestId} initialOptions={videoOptions} submitting={animating} error={videoError} onCancel={()=>{if(!animating)setVideoOpen(false);}} onEvent={(event,routeId)=>{void trackVideoSelectorEvent(media.id,event,routeId).catch(()=>undefined);}} onConfirm={(value)=>void animate(value)}/>:null}
    <Modal visible={editOpen} transparent animationType="fade" onRequestClose={()=>setEditOpen(false)}><View style={styles.modalRoot}><FrostedBackdrop intensity={38}/><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.modalCenter}><FrostedSurface intensity={88} style={styles.editSheet}><View style={styles.editHeader}><View style={styles.editGlyph}><WandSparkles size={22} color={colors.rose}/></View><Pressable accessibilityLabel="Close photo editor" onPress={()=>setEditOpen(false)} style={styles.close}><X size={20} color={colors.muted}/></Pressable></View><Text style={styles.editTitle}>Edit this photo</Text><Text style={styles.editSubtitle}>Describe only what you want changed. Kivelle keeps the original saved.</Text><TextInput value={instruction} onChangeText={setInstruction} placeholder="Change the pose, fix the face, adjust the outfit…" placeholderTextColor={colors.dimmed} multiline maxLength={400} autoFocus style={styles.editInput}/><View style={styles.suggestions}>{EDIT_SUGGESTIONS.map((suggestion)=><Pressable key={suggestion} onPress={()=>setInstruction(suggestion)} style={styles.suggestion}><Text style={styles.suggestionText}>{suggestion}</Text></Pressable>)}</View><Text style={styles.editNote}>Creative edits are visual variants and do not change Kivelle’s canonical relationship or world state.</Text><Pressable disabled={!instruction.trim()||editing} onPress={()=>void edit()} style={[styles.editSubmit,(!instruction.trim()||editing)&&styles.disabled]}><WandSparkles size={17} color="#fff"/><Text style={styles.primaryText}>{editing?'Starting edit…':'Create edit · 10 credits'}</Text></Pressable></FrostedSurface></KeyboardAvoidingView></View></Modal>
  </View>;
}

const VIDEO_FEEDBACK_REASONS=[
  ['face_changed','Face changed'],['body_or_hands_distorted','Body or hands distorted'],['motion_unnatural','Motion looks unnatural'],['outfit_changed','Outfit changed'],['background_changed','Background changed'],['extra_person','Extra person appeared'],['framing_changed','Framing changed'],['took_too_long','Took too long'],['audio_problem','Audio problem'],['other','Other'],
] as const;
function VideoDetails({media,progressState,diagnostics}:{media:GeneratedMedia;progressState:string|null;diagnostics:VideoDiagnostics|null}){
  const[feedbackOpen,setFeedbackOpen]=useState(false),[reasons,setReasons]=useState<string[]>([]),[saving,setSaving]=useState(false),routeName=diagnostics?.routeDisplayName??'Selected video model',audio=media.actual_audio_behavior??diagnostics?.actualAudioBehavior??'unknown';
  const save=async(verdict:'looks_good'|'needs_work')=>{if(saving||verdict==='needs_work'&&!reasons.length)return;setSaving(true);try{await submitVideoFeedback(media.id,verdict,reasons);setFeedbackOpen(false);Alert.alert('Thanks','Your video feedback was saved.');}catch(error){Alert.alert('Feedback unavailable',error instanceof Error?error.message:'Please try again.');}finally{setSaving(false);}};
  return <View style={videoStyles.details}>
    <View style={videoStyles.summary}><View style={videoStyles.summaryTop}><Text style={videoStyles.model}>{routeName}</Text><View style={videoStyles.audioBadge}>{audio==='silent'?<VolumeX size={13} color={colors.muted}/>:<Volume2 size={13} color={colors.violet}/>}<Text style={videoStyles.audioText}>{audio==='silent'?'Silent':audio==='has_audio'?'Audio included':'Audio unverified'}</Text></View></View><Text style={videoStyles.meta}>{progressState??(media.status==='ready'?'Ready':media.status==='failed'?'Failed':'Queued')} · Prompt-directed motion · {media.requested_duration_seconds??10}s · {media.requested_resolution==='provider_native'?'native':media.requested_resolution??'provider'} output</Text></View>
    {media.status==='ready'?<View style={videoStyles.feedback}><Text style={videoStyles.feedbackTitle}>How did this video turn out?</Text><View style={styles.actionRow}><Pressable disabled={saving} onPress={()=>void save('looks_good')} style={styles.secondary}><Text style={styles.secondaryText}>Looks good</Text></Pressable><Pressable disabled={saving} onPress={()=>setFeedbackOpen(true)} style={styles.secondary}><Text style={styles.secondaryText}>Needs work</Text></Pressable></View></View>:null}
    {diagnostics?<View style={videoStyles.diagnostics}><Text style={videoStyles.diagnosticsTitle}>Tester diagnostics</Text><Text style={videoStyles.diagnosticsText}>{diagnostics.routeId} · {diagnostics.providerRequestStatus??diagnostics.status}{typeof diagnostics.quotedProviderCostUsd==='number'?` · quoted $${diagnostics.quotedProviderCostUsd.toFixed(4)}`:''}</Text><Text style={videoStyles.diagnosticsText}>Queue {formatMs(diagnostics.latencyMs?.queue)} · Generation {formatMs(diagnostics.latencyMs?.generation)} · Finalization {formatMs(diagnostics.latencyMs?.finalization)}</Text><Text style={videoStyles.diagnosticsText}>Delivered audio: {diagnostics.actualAudioBehavior==='has_audio'?'present':diagnostics.actualAudioBehavior==='silent'?'silent':'not verified'}</Text></View>:null}
    <Modal visible={feedbackOpen} transparent animationType="fade" onRequestClose={()=>setFeedbackOpen(false)}><View style={styles.modalRoot}><FrostedBackdrop intensity={45}/><FrostedSurface style={videoStyles.feedbackSheet}><View style={styles.editHeader}><Text style={styles.editTitle}>What needs work?</Text><Pressable accessibilityLabel="Close feedback" onPress={()=>setFeedbackOpen(false)} style={styles.close}><X size={19} color={colors.muted}/></Pressable></View><View style={videoStyles.reasonGrid}>{VIDEO_FEEDBACK_REASONS.map(([id,label])=>{const selected=reasons.includes(id);return <Pressable key={id} accessibilityRole="checkbox" accessibilityState={{checked:selected}} onPress={()=>setReasons((current)=>selected?current.filter((item)=>item!==id):[...current,id])} style={[videoStyles.reason,selected&&videoStyles.reasonSelected]}><Text style={videoStyles.reasonText}>{label}</Text></Pressable>;})}</View><Pressable disabled={!reasons.length||saving} onPress={()=>void save('needs_work')} style={[styles.primary,(!reasons.length||saving)&&styles.disabled]}><Text style={styles.primaryText}>{saving?'Saving…':'Send feedback'}</Text></Pressable></FrostedSurface></View></Modal>
  </View>;
}
function formatMs(value:number|null|undefined){if(typeof value!=='number')return'—';return value>=60_000?`${(value/60_000).toFixed(1)}m`:`${Math.round(value/1_000)}s`;}

const videoStyles=StyleSheet.create({details:{paddingHorizontal:spacing.lg,paddingBottom:16,gap:12},summary:{padding:14,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(20,15,28,.68)'},summaryTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},model:{flex:1,color:colors.text,fontWeight:'900',fontSize:16},audioBadge:{minHeight:32,paddingHorizontal:10,borderRadius:radius.pill,flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'rgba(155,99,215,.09)',borderWidth:1,borderColor:'rgba(155,99,215,.20)'},audioText:{color:colors.textSecondary,fontSize:10,fontWeight:'800'},meta:{color:colors.textSecondary,fontSize:12,marginTop:5},feedback:{gap:8},feedbackTitle:{color:colors.text,fontWeight:'800'},diagnostics:{padding:12,borderRadius:radius.md,backgroundColor:'rgba(155,99,215,.08)',borderWidth:1,borderColor:'rgba(155,99,215,.20)'},diagnosticsTitle:{color:colors.violet,fontWeight:'900',fontSize:12,textTransform:'uppercase',letterSpacing:.8},diagnosticsText:{color:colors.textSecondary,fontSize:11,lineHeight:17,marginTop:4},feedbackSheet:{width:'100%',maxWidth:560,alignSelf:'center',padding:spacing.lg,borderRadius:radius.xl},reasonGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginVertical:18},reason:{paddingHorizontal:11,paddingVertical:9,borderRadius:radius.pill,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(255,255,255,.04)'},reasonSelected:{borderColor:'rgba(216,62,234,.62)',backgroundColor:'rgba(216,62,234,.16)'},reasonText:{color:colors.textSecondary,fontSize:12,fontWeight:'700'}});

const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#05070D'},header:{paddingTop:48,paddingHorizontal:spacing.md,paddingBottom:12,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:colors.border},headerCopy:{flex:1},icon:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface},disabled:{opacity:.45},name:{color:colors.text,fontWeight:'800'},meta:{color:colors.muted,fontSize:11,marginTop:3},stage:{flex:1,minHeight:360,padding:spacing.md,alignItems:'center',justifyContent:'center'},stageFrame:{flex:1,width:'100%',maxWidth:1100,borderRadius:radius.xl,overflow:'hidden',backgroundColor:'#090A10',borderWidth:1,borderColor:colors.borderBright},videoLoading:{position:'absolute',zIndex:3,top:0,right:0,bottom:0,left:0,alignItems:'center',justifyContent:'center',gap:10,padding:24,backgroundColor:'#090A10'},playbackErrorTitle:{color:colors.text,fontFamily:'Georgia',fontSize:22,fontWeight:'700',textAlign:'center'},playbackErrorCopy:{maxWidth:360,color:colors.textSecondary,fontSize:13,lineHeight:19,textAlign:'center',marginBottom:4},videoFullscreenButton:{position:'absolute',zIndex:4,right:10,top:10,width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(10,8,16,.78)',borderWidth:1,borderColor:'rgba(255,255,255,.22)'},carouselZone:{position:'absolute',top:0,bottom:0,width:'24%',zIndex:2,justifyContent:'center'},carouselZoneLeft:{left:0,alignItems:'flex-start',paddingLeft:12},carouselZoneRight:{right:0,alignItems:'flex-end',paddingRight:12},carouselZonePressed:{backgroundColor:'rgba(255,255,255,.035)'},carouselArrow:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(12,9,18,.58)',borderWidth:1,borderColor:'rgba(255,255,255,.22)'},carouselCount:{position:'absolute',top:12,left:'50%',marginLeft:-30,width:60,minHeight:28,borderRadius:radius.pill,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(12,9,18,.60)',borderWidth:1,borderColor:'rgba(255,255,255,.14)'},carouselCountText:{color:'#fff',fontSize:11,fontWeight:'800'},state:{flex:1,alignItems:'center',justifyContent:'center',gap:10,padding:24},stateTitle:{color:colors.text,fontFamily:'Georgia',fontSize:24,textAlign:'center'},primary:{minHeight:44,paddingHorizontal:16,borderRadius:radius.pill,backgroundColor:colors.rose,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},primaryText:{color:'#fff',fontWeight:'800'},secondary:{minHeight:44,paddingHorizontal:16,borderRadius:radius.pill,borderWidth:1,borderColor:'rgba(216,62,234,.42)',backgroundColor:'rgba(216,62,234,.10)',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},secondaryText:{color:colors.cream,fontWeight:'800'},details:{paddingHorizontal:spacing.lg,paddingBottom:16,paddingTop:8,gap:10},feedbackRow:{minHeight:30,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},originalLink:{color:colors.textSecondary,fontSize:12,fontWeight:'700'},actionRow:{flexDirection:'row',justifyContent:'flex-end',gap:10,flexWrap:'wrap'},modalRoot:{flex:1,justifyContent:'center',padding:spacing.lg},modalCenter:{width:'100%',alignItems:'center'},editSheet:{width:'100%',maxWidth:520,padding:spacing.lg,borderRadius:radius.xl,borderWidth:1,borderColor:'rgba(216,62,234,.28)',overflow:'hidden'},editHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},editGlyph:{width:46,height:46,borderRadius:23,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(216,62,234,.14)',borderWidth:1,borderColor:'rgba(216,62,234,.28)'},close:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.06)'},editTitle:{marginTop:16,color:colors.text,fontFamily:'Georgia',fontSize:28,fontWeight:'700'},editSubtitle:{marginTop:6,color:colors.textSecondary,lineHeight:20},editInput:{marginTop:18,minHeight:112,maxHeight:180,borderRadius:radius.lg,borderWidth:1,borderColor:colors.borderBright,backgroundColor:'rgba(4,5,10,.58)',padding:16,color:colors.text,fontSize:16,textAlignVertical:'top'},suggestions:{marginTop:12,flexDirection:'row',flexWrap:'wrap',gap:8},suggestion:{paddingHorizontal:11,paddingVertical:8,borderRadius:radius.pill,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(255,255,255,.045)'},suggestionText:{color:colors.textSecondary,fontSize:12,fontWeight:'700'},editNote:{marginTop:14,color:colors.muted,fontSize:11,lineHeight:16},editSubmit:{marginTop:18,minHeight:50,borderRadius:radius.pill,backgroundColor:colors.rose,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}});
