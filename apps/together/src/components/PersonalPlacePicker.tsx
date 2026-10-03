import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, Check, ChevronDown, ChevronRight, Home, MapPin, Plus, Sparkles, Trash2, X } from 'lucide-react-native';
import { CatalogImage as Image } from './CatalogImage';
import { locationHeroAsset, worldHeroAsset } from '../assets';
import type { Location, Snapshot, World } from '../types';
import { archivePersonalPlace, confirmPersonalPlaceImage, createPersonalPlace, listPersonalPlaces, prepareNewPersonalPlaceImage, preparePersonalPlaceImage, updatePersonalPlace } from '../lib/api';
import { defaultPlaceHoursDraft, placeHoursDraft, serializePlaceHours, validPersonalPlaceHours } from '@together/domain/src/place-hours';
import { PlaceHoursEditor } from './PlaceHoursEditor';
import { useTogether } from '../store/useTogether';
import { locationImageSource } from '../lib/locationImageSource';
import { cleanupNormalizedImage, normalizeUserImage, userImagePickerOptions } from '../lib/imageUploads';
import { uploadPreparedChatPhoto } from '../lib/chatPhotoStorageUpload';
import { supabase } from '../lib/supabase';
import { canAccessWorld } from '../lib/place';
import { isComingSoonWorld, withComingSoonWorlds } from '../lib/comingSoonWorlds';
import { compareWorldSelectorOrder } from '../lib/worldSelectorOrder';
import { isWorldCatalogVisible } from '@together/domain/src/world-access';
import { colors } from '../theme';

type Props={visible:boolean;worldId:string;snapshot:Snapshot;onClose:()=>void;onSelect?:(place:Location,activity:string)=>void;onPlacesChange?:(places:Location[])=>void;startInCreateMode?:boolean};
type Selector='world'|'district'|'kind'|null;
type PlaceKind='home'|'bar'|'restaurant'|'hotel'|'outdoors'|'other';
const placeKinds:{value:PlaceKind;label:string;detail:string}[]=[
  {value:'home',label:'Home',detail:'An apartment, house, or personal room'},
  {value:'bar',label:'Bar',detail:'A place for drinks and conversation'},
  {value:'restaurant',label:'Restaurant',detail:'A place to share a meal'},
  {value:'hotel',label:'Hotel',detail:'A stay or getaway'},
  {value:'outdoors',label:'Outdoors',detail:'A spot under the open sky'},
  {value:'other',label:'Other place',detail:'Any favorite spot you can visit together'},
];
const kindLabel=(value:PlaceKind)=>placeKinds.find((option)=>option.value===value)?.label??'Place';
const storedKind=(place:Location):PlaceKind=>{
  const value=place.metadata?.kind;
  return placeKinds.some((option)=>option.value===value)?value as PlaceKind:place.category==='home'?'home':'other';
};

export function PersonalPlacePicker({visible,worldId,snapshot,onClose,onSelect,onPlacesChange,startInCreateMode=false}:Props){
  const {width,height}=useWindowDimensions();
  const insets=useSafeAreaInsets();
  const compact=width<680;
  const worlds=withComingSoonWorlds(snapshot.worlds.filter(isWorldCatalogVisible)).sort(compareWorldSelectorOrder);
  const [selectedWorldId,setSelectedWorldId]=useState(worldId);
  const [places,setPlaces]=useState<Location[]>([]);
  const [quota,setQuota]=useState<{used:number;limit:number}|null>(null);
  const [editing,setEditing]=useState<Location|null>(null);
  const [formOpen,setFormOpen]=useState(startInCreateMode);
  const [selector,setSelector]=useState<Selector>(null);
  const [name,setName]=useState('');
  const [description,setDescription]=useState('');
  const [activities,setActivities]=useState('');
  const [kind,setKind]=useState<PlaceKind>('home');
  const [districtId,setDistrictId]=useState<string|undefined>();
  const [photo,setPhoto]=useState<ImagePicker.ImagePickerAsset|null>(null);
  const [hours,setHours]=useState(defaultPlaceHoursDraft);
  const pendingImage=useRef<{locationId:string;worldId:string;uri:string;path:string;width:number;height:number}|null>(null);
  const saving=useRef(false);
  const [busy,setBusy]=useState(false);
  const [archiveConfirm,setArchiveConfirm]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const selectedWorld=worlds.find((world)=>world.id===selectedWorldId)??worlds.find((world)=>world.id===worldId);
  const districts=snapshot.locations.filter((place)=>place.world_id===selectedWorldId&&!place.owner_user_id&&['district','neighborhood'].includes(place.location_type));
  const district=districts.find((place)=>place.id===districtId);
  const visiblePlaces=places.filter((place)=>place.world_id===selectedWorldId);
  const limitReached=quota!==null&&quota.used>=quota.limit;
  const imageSource=photo?{uri:photo.uri}:locationImageSource(selectedWorld?.slug,editing);

  const startCreate=(beforeQuotaLoads=false)=>{
    if(!beforeQuotaLoads&&limitReached){setNotice(`Your plan includes ${quota!.limit} personal places. Archive one or upgrade to create another.`);return;}
    setEditing(null);setName('');setDescription('');setActivities('Talking, relaxing');setKind('home');
    setDistrictId(undefined);setPhoto(null);setHours(defaultPlaceHoursDraft());pendingImage.current=null;setError('');setNotice('');setArchiveConfirm(false);setFormOpen(true);
  };
  useEffect(()=>{
    if(!visible)return;
    let alive=true;
    setSelectedWorldId(worldId);setFormOpen(false);setSelector(null);setError('');setNotice('');setQuota(null);
    if(startInCreateMode)startCreate(true);
    void listPersonalPlaces().then(({places:rows,quota:nextQuota})=>{if(alive){setPlaces(rows);setQuota(nextQuota);onPlacesChange?.(rows);}})
      .catch((cause)=>{if(alive)setError(cause instanceof Error?cause.message:'Your places could not be loaded.');});
    return()=>{alive=false;};
  },[visible,worldId,startInCreateMode]);
  const startEdit=(place:Location)=>{
    setSelectedWorldId(place.world_id);setEditing(place);setName(place.name);setDescription(place.description);
    setActivities(place.possible_activities.join(', '));setKind(storedKind(place));
    setHours(placeHoursDraft(place.hours));pendingImage.current=null;
    setDistrictId(place.parent_location_id??undefined);setPhoto(null);setError('');setNotice('');setArchiveConfirm(false);setFormOpen(true);
  };
  const pickPhoto=async()=>{
    try{
      const result=await ImagePicker.launchImageLibraryAsync(userImagePickerOptions('library'));
      if(!result.canceled&&result.assets[0]){setPhoto(result.assets[0]);setError('');}
    }catch{setError('Your photo library could not be opened. Try again.');}
  };
  const save=async()=>{
    if(saving.current)return;
    if(!editing&&limitReached){setError(`Your plan includes ${quota!.limit} personal places. Archive one or upgrade to create another.`);return;}
    const parsedActivities=[...new Set(activities.split(',').map((item)=>item.trim()).filter(Boolean))];
    if(name.trim().length<2||description.trim().length<12||!parsedActivities.length){setError('Add a name, a short description, and at least one activity.');return;}
    if(parsedActivities.length>8||parsedActivities.some((activity)=>activity.length<2||activity.length>64)){setError('Add up to eight activities, each between 2 and 64 characters.');return;}
    if(!photo&&!editing?.custom_image_path){setError('Upload an image for your place before saving.');return;}
    const savedHours=serializePlaceHours(hours);
    if(!validPersonalPlaceHours(savedHours)){setError('Choose valid opening and closing times. Use Open 24/7 for all-day access.');return;}
    saving.current=true;setBusy(true);setError('');
    let saved:Location|undefined;
    try{
      let uploaded=pendingImage.current;
      if(photo&&(!uploaded||uploaded.uri!==photo.uri||uploaded.worldId!==selectedWorldId)){
        const normalized=await normalizeUserImage({uri:photo.uri,width:photo.width,height:photo.height,fileName:photo.fileName,fileSize:photo.fileSize});
        try{
          const prepared=editing?{locationId:editing.id,...await preparePersonalPlaceImage(editing.id)}:await prepareNewPersonalPlaceImage(selectedWorldId);
          const {upload}=prepared;
          await uploadPreparedChatPhoto({storage:supabase.storage.from('together-user-media'),upload,body:await(await fetch(normalized.uri)).blob(),contentType:'image/jpeg'});
          uploaded={locationId:prepared.locationId,worldId:selectedWorldId,uri:photo.uri,path:upload.path,width:normalized.width,height:normalized.height};pendingImage.current=uploaded;
        }finally{cleanupNormalizedImage(normalized.uri);}
      }
      if(editing){
        if(photo&&uploaded){saved=(await confirmPersonalPlaceImage({locationId:editing.id,path:uploaded.path,width:uploaded.width,height:uploaded.height})).place;useTogether.getState().upsertPersonalPlace(saved);}
        saved=(await updatePersonalPlace({locationId:editing.id,name:name.trim(),description:description.trim(),activities:parsedActivities,hours:savedHours})).place;
      }else{
        if(!uploaded)throw new Error('Upload an image for your place before saving.');
        saved=(await createPersonalPlace({locationId:uploaded.locationId,worldId:selectedWorldId,parentLocationId:districtId,kind,name:name.trim(),description:description.trim(),activities:parsedActivities,hours:savedHours,image:{path:uploaded.path,width:uploaded.width,height:uploaded.height}})).place;
      }
      pendingImage.current=null;
      useTogether.getState().upsertPersonalPlace(saved);
      const updated=[saved,...places.filter((item)=>item.id!==saved!.id)];
      setPlaces(updated);onPlacesChange?.(updated);setFormOpen(false);
      if(!editing)setQuota((current)=>current?{...current,used:current.used+1}:current);
      if(!onSelect)onClose();
      else if(saved.world_id===worldId){onSelect(saved,saved.possible_activities[0]??'Talking');onClose();}
      else setNotice(`${saved.name} is ready in ${selectedWorld?.name??'its world'}. Choose a companion there to plan a visit.`);
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Your place could not be saved.');
      if(saved){const updated=[saved,...places.filter((item)=>item.id!==saved!.id)];setPlaces(updated);onPlacesChange?.(updated);setEditing(saved);}
    }finally{saving.current=false;setBusy(false);}
  };
  const archive=async()=>{
    if(!editing)return;
    setBusy(true);setError('');
    try{await archivePersonalPlace(editing.id);useTogether.getState().upsertPersonalPlace({...editing,archived_at:new Date().toISOString()});const updated=places.filter((item)=>item.id!==editing.id);setPlaces(updated);setQuota((current)=>current?{...current,used:Math.max(0,current.used-1)}:current);onPlacesChange?.(updated);setFormOpen(false);setNotice(`${editing.name} was archived.`);}
    catch(cause){setError(cause instanceof Error?cause.message:'Your place could not be archived.');}
    finally{setBusy(false);}
  };
  const openSelector=(value:Selector)=>{Keyboard.dismiss();setSelector(value);};

  return <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={selector?()=>setSelector(null):onClose}>
    <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={[styles.backdrop,!compact&&styles.backdropWide]}>
      <View style={[styles.panel,compact?{height,maxHeight:height,paddingTop:insets.top,paddingBottom:Math.max(insets.bottom,12)}:{maxHeight:Math.min(height-40,900),borderBottomLeftRadius:25,borderBottomRightRadius:25}]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={formOpen?(startInCreateMode?'Close create a place':'Back to your places'):'Close your places'} onPress={formOpen&&!startInCreateMode?()=>{setFormOpen(false);setError('');}:onClose} style={styles.headerButton}><ArrowLeft size={22} color={colors.text}/></Pressable>
          <View style={styles.headerTitle}><Text style={styles.title}>{formOpen?editing?'Edit your place':'Create a place':'Your places'}</Text><Text style={styles.subtitle}>{formOpen?'Build somewhere you and your companions can visit.':'Make a private place and invite someone through a plan.'}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.headerButton}><X size={20} color={colors.muted}/></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {formOpen?<>
            <View style={styles.hero}>
              <Image source={imageSource} contentFit="cover" style={StyleSheet.absoluteFill}/>
              <View style={styles.heroShade}/>
              <View style={styles.heroTop}><Text style={styles.heroEyebrow}>YOUR PRIVATE PLACE</Text><Pressable accessibilityRole="button" accessibilityLabel="Upload place image" onPress={()=>void pickPhoto()} style={styles.heroCamera}><Camera size={18} color="#fff"/></Pressable></View>
              <View style={styles.heroBottom}><View style={{flex:1}}><Text style={styles.heroName} numberOfLines={1}>{name.trim()||'Your new place'}</Text><View style={styles.heroLocationRow}><MapPin size={12} color="#F5DCEB"/><Text style={styles.heroLocation} numberOfLines={1}>{district?.name?`${district.name} · `:''}{selectedWorld?.name??'Your world'} · {kindLabel(kind)}</Text></View></View>{width>=390?<Pressable accessibilityRole="button" onPress={()=>void pickPhoto()} style={styles.uploadButton}><Camera size={15} color="#fff"/><Text style={styles.uploadText}>{photo||editing?.custom_image_url?'Change image':'Upload image'}</Text></Pressable>:null}</View>
            </View>
            <Text style={styles.photoHint}>{photo||editing?.custom_image_path?'Your place image is ready.':'Image required · Upload a photo to bring your place to life.'}</Text>

            <View style={styles.field}><View style={styles.fieldHeading}><Text style={styles.label}>Place name</Text><Text style={styles.counter}>{name.length}/80</Text></View><TextInput accessibilityLabel="Place name" value={name} onChangeText={setName} maxLength={80} placeholder="My apartment" placeholderTextColor={colors.dimmed} style={styles.input}/></View>
            <View style={styles.field}><View style={styles.fieldHeading}><Text style={styles.label}>Describe the atmosphere</Text><Text style={styles.counter}>{description.length}/1000</Text></View><TextInput accessibilityLabel="Describe the atmosphere" value={description} onChangeText={setDescription} maxLength={1000} multiline placeholder="Warm light, a sofa by the window, a collection of old records…" placeholderTextColor={colors.dimmed} style={[styles.input,styles.textarea]}/></View>

            <View style={styles.field}><Text style={styles.label}>Type</Text><Pressable accessibilityRole="button" accessibilityLabel={`Place type: ${kindLabel(kind)}`} accessibilityState={{disabled:Boolean(editing)}} disabled={Boolean(editing)} onPress={()=>openSelector('kind')} style={[styles.selectRow,editing&&styles.selectDisabled]}><Home size={19} color={colors.rose}/><View style={styles.selectCopy}><Text style={styles.selectTitle}>{kindLabel(kind)}</Text><Text style={styles.selectDetail}>{editing?'Type cannot be changed after creation.':placeKinds.find((option)=>option.value===kind)?.detail}</Text></View>{!editing?<ChevronRight size={18} color={colors.muted}/>:null}</Pressable></View>

            <View style={styles.field}><Text style={styles.label}>World</Text><Pressable accessibilityRole="button" accessibilityLabel={`World: ${selectedWorld?.name??'Choose a world'}`} accessibilityState={{disabled:Boolean(editing)}} disabled={Boolean(editing)} onPress={()=>openSelector('world')} style={[styles.selectRow,editing&&styles.selectDisabled]}><Image source={worldHeroAsset(selectedWorld?.slug)} contentFit="cover" style={styles.selectImage}/><View style={styles.selectCopy}><Text style={styles.selectTitle}>{selectedWorld?.name??'Choose a world'}</Text><Text style={styles.selectDetail} numberOfLines={1}>{editing?'World cannot be changed after creation.':selectedWorld?.description??'Choose where this place belongs'}</Text></View>{!editing?<ChevronRight size={18} color={colors.muted}/>:null}</Pressable></View>

            <View style={styles.field}><Text style={styles.label}>District <Text style={styles.optional}>(optional)</Text></Text><Pressable accessibilityRole="button" accessibilityLabel={`District: ${district?.name??'No district selected'}`} accessibilityState={{disabled:Boolean(editing)}} disabled={Boolean(editing)} onPress={()=>openSelector('district')} style={[styles.selectRow,editing&&styles.selectDisabled]}>{district?<Image source={locationHeroAsset(selectedWorld?.slug,district.slug)} contentFit="cover" style={styles.selectImage}/>:<View style={styles.selectIcon}><MapPin size={19} color={colors.violet}/></View>}<View style={styles.selectCopy}><Text style={styles.selectTitle}>{district?.name??'Anywhere in this world'}</Text><Text style={styles.selectDetail} numberOfLines={1}>{editing?'District cannot be changed after creation.':district?.description??'Choose a neighborhood if you have one in mind'}</Text></View>{!editing?<ChevronRight size={18} color={colors.muted}/>:null}</Pressable></View>

            <View style={styles.field}><Text style={styles.label}>What can happen here?</Text><Text style={styles.fieldHint}>Add things you and your companions can actually do at this place.</Text><TextInput accessibilityLabel="Activities at this place" value={activities} onChangeText={setActivities} maxLength={400} placeholder="Talking, cooking, listening to music" placeholderTextColor={colors.dimmed} style={styles.input}/><Text style={styles.fieldHint}>Separate activities with commas. You can choose one when planning.</Text></View>

            <PlaceHoursEditor value={hours} onChange={setHours} disabled={busy}/>
            {!editing&&limitReached?<View><Text accessibilityRole="alert" style={styles.error}>You have {quota!.used} of {quota!.limit} places across all worlds. Archive one or upgrade to create another.</Text><Pressable accessibilityRole="button" onPress={()=>{setFormOpen(false);setError('');}}><Text style={styles.fieldHint}>View your places</Text></Pressable></View>:null}
            {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
            <Pressable accessibilityRole="button" disabled={busy||(!editing&&limitReached)} onPress={()=>void save()} style={[styles.primary,(busy||(!editing&&limitReached))&&styles.disabled]}>{busy?<ActivityIndicator color="#fff"/>:<><Sparkles size={19} color="#fff"/><Text style={styles.primaryText}>{editing?'Save place':'Create place'}</Text></>}</Pressable>
            {editing?<>{archiveConfirm?<View style={styles.archivePrompt}><Text style={styles.archiveText}>Archive {editing.name}? Existing memories and finished plans will remain.</Text><Pressable disabled={busy} onPress={()=>void archive()} style={styles.archive}><Trash2 size={15} color={colors.danger}/><Text style={[styles.archiveText,{color:colors.danger}]}>Confirm archive</Text></Pressable><Pressable onPress={()=>setArchiveConfirm(false)} style={styles.archive}><Text style={styles.archiveText}>Keep place</Text></Pressable></View>:<Pressable disabled={busy} onPress={()=>setArchiveConfirm(true)} style={styles.archive}><Trash2 size={15} color={colors.muted}/><Text style={styles.archiveText}>Archive this place</Text></Pressable>}</>:null}
          </>:<>
            <Pressable accessibilityRole="button" onPress={()=>openSelector('world')} style={styles.listWorld}><Image source={worldHeroAsset(selectedWorld?.slug)} contentFit="cover" style={styles.listWorldImage}/><View style={styles.selectCopy}><Text style={styles.listWorldEyebrow}>WORLD</Text><Text style={styles.selectTitle}>{selectedWorld?.name??'Choose a world'}</Text></View><ChevronDown size={18} color={colors.muted}/></Pressable>
            {notice?<Text style={styles.notice}>{notice}</Text>:null}
            {quota?<Text style={styles.fieldHint}>{quota.used} of {quota.limit} personal places across all worlds</Text>:null}
            <Pressable accessibilityRole="button" disabled={limitReached} onPress={()=>startCreate()} style={[styles.create,limitReached&&styles.disabled]}><Plus size={20} color="#fff"/><Text style={styles.createText}>Create a place</Text></Pressable>
            {limitReached?<Text style={styles.fieldHint}>Archive a place or upgrade your plan to add another.</Text>:null}
            {visiblePlaces.map((place)=><View key={place.id} style={styles.placeCard}><View style={styles.placeMain}><Image source={locationImageSource(selectedWorld?.slug,place)} contentFit="cover" style={styles.thumb}/><View style={styles.placeCopy}><Text style={styles.placeName}>{place.name}</Text><Text style={styles.placeDescription} numberOfLines={2}>{place.description}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${place.name}`} onPress={()=>startEdit(place)} style={styles.edit}><Text style={styles.editText}>Edit</Text></Pressable></View><View style={styles.activityList}>{place.possible_activities.map((activity)=><Pressable key={activity} accessibilityRole="button" disabled={!onSelect||place.world_id!==worldId} onPress={()=>{onSelect?.(place,activity);onClose();}} style={[styles.activityRow,(!onSelect||place.world_id!==worldId)&&styles.selectDisabled]}><Text style={styles.activityText}>{activity}</Text><ChevronRight size={16} color={colors.muted}/></Pressable>)}</View>{place.world_id!==worldId?<Text style={styles.fieldHint}>Open a plan with someone in {selectedWorld?.name??'this world'} to visit here.</Text>:null}</View>)}
            {!visiblePlaces.length?<View style={styles.empty}><MapPin size={24} color={colors.violet}/><Text style={styles.emptyTitle}>No places here yet</Text><Text style={styles.emptyText}>Add a photo, set the hours, and invite companions to your own private place.</Text></View>:null}
            {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
          </>}
        </ScrollView>

        {selector?<View style={styles.selectorOverlay}>
          <Pressable accessibilityLabel="Close selector" onPress={()=>setSelector(null)} style={StyleSheet.absoluteFill}/>
          <View style={[styles.selectorCard,compact&&{paddingBottom:Math.max(insets.bottom,18)}]}>
            <View style={styles.selectorHeader}><View style={{flex:1}}><Text style={styles.selectorTitle}>{selector==='world'?'Choose a world':selector==='district'?'Choose a district':'Type of place'}</Text><Text style={styles.selectorDescription}>{selector==='world'?'Your place belongs to one world.':selector==='district'?'Choose where it sits, or leave it open.':'How should this place appear in your world?'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close selector" onPress={()=>setSelector(null)} style={styles.headerButton}><X size={19} color={colors.muted}/></Pressable></View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.selectorOptions}>
              {selector==='world'?worlds.map((world)=><WorldOption key={world.id} world={world} active={world.id===selectedWorldId} locked={isComingSoonWorld(world)||!canAccessWorld(snapshot,world)} onPress={()=>{setSelectedWorldId(world.id);setDistrictId(undefined);setSelector(null);}}/>):null}
              {selector==='district'?<><SelectorOption title="Anywhere in this world" detail="Choose a district later" active={!districtId} onPress={()=>{setDistrictId(undefined);setSelector(null);}}/>{districts.map((option)=><SelectorOption key={option.id} title={option.name} detail={option.description} image={locationHeroAsset(selectedWorld?.slug,option.slug)} active={districtId===option.id} onPress={()=>{setDistrictId(option.id);setSelector(null);}}/>)}</>:null}
              {selector==='kind'?placeKinds.map((option)=><SelectorOption key={option.value} title={option.label} detail={option.detail} active={kind===option.value} onPress={()=>{setKind(option.value);setSelector(null);}}/>):null}
            </ScrollView>
          </View>
        </View>:null}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function WorldOption({world,active,locked,onPress}:{world:World;active:boolean;locked:boolean;onPress:()=>void}){
  return <SelectorOption title={world.name} detail={locked?(isComingSoonWorld(world)?'Coming soon':'Requires world access'):world.description} image={worldHeroAsset(world.slug)} active={active} disabled={locked} onPress={onPress}/>;
}

function SelectorOption({title,detail,image,active,disabled=false,onPress}:{title:string;detail:string;image?:ReturnType<typeof worldHeroAsset>;active:boolean;disabled?:boolean;onPress:()=>void}){
  return <Pressable accessibilityRole="button" accessibilityLabel={[title,detail].filter(Boolean).join('. ')} accessibilityState={{selected:active,disabled}} disabled={disabled} onPress={onPress} style={[styles.option,active&&styles.optionActive,disabled&&styles.optionDisabled]}>{image?<Image source={image} contentFit="cover" style={styles.optionImage}/>:<View style={styles.optionIcon}><MapPin size={19} color={colors.violet}/></View>}<View style={styles.optionCopy}><Text style={styles.optionTitle}>{title}</Text><Text style={styles.optionDetail} numberOfLines={2}>{detail}</Text></View>{active?<View style={styles.check}><Check size={14} strokeWidth={3} color="#fff"/></View>:<ChevronRight size={17} color={colors.dimmed}/>}</Pressable>;
}

const styles=StyleSheet.create({
  backdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(2,1,6,.78)'},backdropWide:{alignItems:'center',justifyContent:'center',padding:20},
  panel:{width:'100%',maxWidth:720,flexShrink:1,backgroundColor:'#140E1B',borderColor:'rgba(220,157,231,.25)',borderWidth:1,borderTopLeftRadius:25,borderTopRightRadius:25,overflow:'hidden'},
  header:{flexDirection:'row',alignItems:'center',gap:11,paddingHorizontal:16,paddingVertical:13,borderBottomWidth:1,borderBottomColor:colors.border},headerButton:{width:38,height:38,alignItems:'center',justifyContent:'center',borderRadius:19,backgroundColor:'rgba(255,255,255,.055)'},headerTitle:{flex:1,minWidth:0},title:{color:colors.text,fontFamily:'Georgia',fontSize:26},subtitle:{color:colors.muted,fontSize:11,lineHeight:17,marginTop:2},content:{padding:18,paddingBottom:30,gap:16},
  hero:{height:225,borderRadius:19,overflow:'hidden',backgroundColor:'#2A1C33',justifyContent:'space-between',borderWidth:1,borderColor:'rgba(250,210,245,.2)'},heroShade:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:'rgba(10,5,16,.28)'},heroTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:14},heroEyebrow:{color:'#FFF5F9',fontWeight:'900',fontSize:9,letterSpacing:2},heroCamera:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(12,7,19,.78)',borderWidth:1,borderColor:'rgba(255,255,255,.34)'},heroBottom:{flexDirection:'row',alignItems:'flex-end',gap:10,padding:16,backgroundColor:'rgba(10,5,16,.55)'},heroName:{color:'#fff',fontFamily:'Georgia',fontSize:27},heroLocationRow:{flexDirection:'row',alignItems:'center',gap:4,marginTop:4},heroLocation:{color:'#F5DCEB',fontSize:11,flexShrink:1},uploadButton:{flexDirection:'row',alignItems:'center',gap:6,borderRadius:11,backgroundColor:'rgba(31,17,38,.9)',borderWidth:1,borderColor:'rgba(255,255,255,.38)',paddingHorizontal:10,paddingVertical:8},uploadText:{color:'#fff',fontSize:11,fontWeight:'800'},photoHint:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:-9},
  field:{gap:7},fieldHeading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},label:{color:colors.text,fontSize:13,fontWeight:'800'},optional:{color:colors.muted,fontWeight:'500'},counter:{color:colors.dimmed,fontSize:10},input:{color:colors.text,backgroundColor:'#0E0A15',borderWidth:1,borderColor:'rgba(215,175,225,.26)',borderRadius:12,paddingHorizontal:14,paddingVertical:13,fontSize:14},textarea:{minHeight:105,textAlignVertical:'top'},fieldHint:{color:colors.muted,fontSize:11,lineHeight:17},selectRow:{minHeight:70,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'rgba(17,12,25,.9)',borderWidth:1,borderColor:'rgba(215,175,225,.24)',borderRadius:13,padding:11},selectDisabled:{opacity:.58},selectImage:{width:66,height:48,borderRadius:8},selectIcon:{width:48,height:48,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(155,99,215,.12)'},selectCopy:{flex:1,minWidth:0},selectTitle:{color:colors.text,fontSize:14,fontWeight:'800'},selectDetail:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:3},
  error:{color:colors.danger,fontSize:12,lineHeight:17},notice:{color:colors.success,fontSize:12,lineHeight:18},primary:{minHeight:53,borderRadius:14,backgroundColor:'#A921C8',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,marginTop:6},primaryText:{color:'#fff',fontSize:15,fontWeight:'900'},disabled:{opacity:.5},archivePrompt:{padding:12,borderRadius:12,borderWidth:1,borderColor:colors.danger,gap:4},archive:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,padding:11},archiveText:{color:colors.muted,fontSize:12},
  listWorld:{flexDirection:'row',alignItems:'center',gap:12,padding:11,borderRadius:14,borderWidth:1,borderColor:'rgba(215,175,225,.24)',backgroundColor:'rgba(17,12,25,.9)'},listWorldImage:{width:65,height:46,borderRadius:8},listWorldEyebrow:{color:colors.violet,fontSize:9,fontWeight:'900',letterSpacing:1.4,marginBottom:3},create:{minHeight:50,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,backgroundColor:'#A921C8',borderRadius:13},createText:{color:'#fff',fontSize:14,fontWeight:'900'},placeCard:{borderWidth:1,borderColor:colors.border,borderRadius:15,backgroundColor:'rgba(26,19,35,.8)',padding:12,gap:9},placeMain:{flexDirection:'row',alignItems:'center',gap:11},thumb:{width:65,height:65,borderRadius:10},placeCopy:{flex:1,minWidth:0},placeName:{color:colors.text,fontSize:15,fontWeight:'800'},placeDescription:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:4},edit:{padding:9},editText:{color:colors.rose,fontSize:12,fontWeight:'800'},activityList:{gap:2,marginLeft:76},activityRow:{minHeight:36,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,borderTopColor:colors.border},activityText:{color:colors.textSecondary,fontSize:12,fontWeight:'700'},empty:{alignItems:'center',gap:8,padding:26},emptyTitle:{color:colors.text,fontFamily:'Georgia',fontSize:20},emptyText:{color:colors.muted,textAlign:'center',fontSize:12,lineHeight:18},
  selectorOverlay:{position:'absolute',top:0,right:0,bottom:0,left:0,justifyContent:'flex-end',backgroundColor:'rgba(3,2,8,.76)',zIndex:10},selectorCard:{backgroundColor:'#21172C',borderTopLeftRadius:23,borderTopRightRadius:23,borderWidth:1,borderColor:'rgba(201,145,225,.38)',padding:17,maxHeight:'76%'},selectorHeader:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:10},selectorTitle:{color:colors.text,fontFamily:'Georgia',fontSize:24},selectorDescription:{color:colors.muted,fontSize:11,marginTop:4},selectorOptions:{gap:7,paddingBottom:4},option:{minHeight:67,flexDirection:'row',alignItems:'center',gap:12,borderRadius:13,padding:8,borderWidth:1,borderColor:'rgba(255,255,255,.07)',backgroundColor:'rgba(12,9,19,.5)'},optionActive:{borderColor:'rgba(210,135,240,.78)',backgroundColor:'rgba(130,56,160,.22)'},optionDisabled:{opacity:.48},optionImage:{width:66,height:49,borderRadius:9},optionIcon:{width:49,height:49,borderRadius:9,backgroundColor:'rgba(155,99,215,.14)',alignItems:'center',justifyContent:'center'},optionCopy:{flex:1,minWidth:0},optionTitle:{color:colors.text,fontSize:13,fontWeight:'800'},optionDetail:{color:colors.muted,fontSize:11,lineHeight:15,marginTop:3},check:{width:22,height:22,borderRadius:11,backgroundColor:colors.violet,alignItems:'center',justifyContent:'center'},
});
