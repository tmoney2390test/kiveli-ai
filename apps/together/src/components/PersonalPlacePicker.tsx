import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CatalogImage as Image } from './CatalogImage';
import { Camera, Check, MapPin, Plus, Trash2, X } from 'lucide-react-native';
import type { Location } from '../types';
import { archivePersonalPlace, confirmPersonalPlaceImage, createPersonalPlace, listPersonalPlaces, preparePersonalPlaceImage, updatePersonalPlace } from '../lib/api';
import { cleanupNormalizedImage, normalizeUserImage, userImagePickerOptions } from '../lib/imageUploads';
import { uploadPreparedChatPhoto } from '../lib/chatPhotoStorageUpload';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

type Props={visible:boolean;worldId:string;districts:Location[];onClose:()=>void;onSelect:(place:Location,activity:string)=>void;onPlacesChange:(places:Location[])=>void};
export function PersonalPlacePicker({visible,worldId,districts,onClose,onSelect,onPlacesChange}:Props){
  const[places,setPlaces]=useState<Location[]>([]);
  const[editing,setEditing]=useState<Location|null>(null);
  const[formOpen,setFormOpen]=useState(false);
  const[name,setName]=useState('');
  const[description,setDescription]=useState('');
  const[activities,setActivities]=useState('');
  const[kind,setKind]=useState<'home'|'other'>('home');
  const[districtId,setDistrictId]=useState<string|undefined>();
  const[photo,setPhoto]=useState<ImagePicker.ImagePickerAsset|null>(null);
  const[busy,setBusy]=useState(false);
  const[archiveConfirm,setArchiveConfirm]=useState(false);
  const[error,setError]=useState('');
  useEffect(()=>{if(!visible||!worldId)return;let alive=true;setError('');void listPersonalPlaces(worldId).then(({places:rows})=>{if(alive){setPlaces(rows);onPlacesChange(rows);}}).catch((cause)=>{if(alive)setError(cause instanceof Error?cause.message:'Your places could not be loaded.');});return()=>{alive=false;};},[visible,worldId]);
  const startCreate=()=>{setEditing(null);setName('');setDescription('');setActivities('Talking, relaxing');setKind('home');setDistrictId(undefined);setPhoto(null);setError('');setArchiveConfirm(false);setFormOpen(true);};
  const startEdit=(place:Location)=>{setEditing(place);setName(place.name);setDescription(place.description);setActivities(place.possible_activities.join(', '));setKind(place.category==='home'?'home':'other');setDistrictId(place.parent_location_id??undefined);setPhoto(null);setError('');setArchiveConfirm(false);setFormOpen(true);};
  const pickPhoto=async()=>{try{const result=await ImagePicker.launchImageLibraryAsync(userImagePickerOptions('library'));if(!result.canceled&&result.assets[0]){setPhoto(result.assets[0]);setError('');}}catch{setError('Your photo library could not be opened. Try again.');}};
  const save=async()=>{
    const parsedActivities=[...new Set(activities.split(',').map((item)=>item.trim()).filter(Boolean))].slice(0,8);
    if(name.trim().length<2||description.trim().length<12||!parsedActivities.length){setError('Add a name, a short description, and at least one activity.');return;}
    setBusy(true);setError('');
    let saved:Location|undefined;
    try{
      saved=editing?(await updatePersonalPlace({locationId:editing.id,name:name.trim(),description:description.trim(),activities:parsedActivities})).place
        :(await createPersonalPlace({worldId,parentLocationId:districtId,kind,name:name.trim(),description:description.trim(),activities:parsedActivities})).place;
      if(photo){
        const normalized=await normalizeUserImage({uri:photo.uri,width:photo.width,height:photo.height,fileName:photo.fileName,fileSize:photo.fileSize});
        try{
          const{upload}=await preparePersonalPlaceImage(saved.id);
          await uploadPreparedChatPhoto({storage:supabase.storage.from('together-user-media'),upload,body:await(await fetch(normalized.uri)).blob(),contentType:'image/jpeg'});
          saved=(await confirmPersonalPlaceImage({locationId:saved.id,path:upload.path,width:normalized.width,height:normalized.height})).place;
        }finally{cleanupNormalizedImage(normalized.uri);}
      }
      const updated=[saved,...places.filter((item)=>item.id!==saved!.id)];
      setPlaces(updated);onPlacesChange(updated);setFormOpen(false);onSelect(saved,saved.possible_activities[0]??'Talking');onClose();
    }catch(cause){setError(cause instanceof Error?cause.message:'Your place could not be saved.');if(saved){const updated=[saved,...places.filter((item)=>item.id!==saved!.id)];setPlaces(updated);onPlacesChange(updated);setEditing(saved);}}
    finally{setBusy(false);}
  };
  const archive=async()=>{if(!editing)return;setBusy(true);setError('');try{await archivePersonalPlace(editing.id);const updated=places.filter((item)=>item.id!==editing.id);setPlaces(updated);onPlacesChange(updated);setFormOpen(false);}catch(cause){setError(cause instanceof Error?cause.message:'Your place could not be archived.');}finally{setBusy(false);}};
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.backdrop}><View style={styles.panel}>
    <View style={styles.header}><View style={{flex:1}}><Text style={styles.title}>{formOpen?editing?'Edit your place':'Create a place':'Your places'}</Text><Text style={styles.subtitle}>Private to you. Invite companions through a plan.</Text></View><Pressable accessibilityLabel="Close personal places" onPress={onClose} style={styles.icon}><X size={20} color={colors.text}/></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {formOpen?<><Text style={styles.label}>Place name</Text><TextInput value={name} onChangeText={setName} maxLength={80} placeholder="My apartment" placeholderTextColor={colors.dimmed} style={styles.input}/>
        <Text style={styles.label}>What does it look and feel like?</Text><TextInput value={description} onChangeText={setDescription} maxLength={1000} multiline placeholder="Warm light, a sofa by the window, a collection of old records…" placeholderTextColor={colors.dimmed} style={[styles.input,styles.textarea]}/>
        {!editing?<><Text style={styles.label}>Kind of place</Text><View style={styles.row}>{(['home','other'] as const).map((value)=><Pressable key={value} onPress={()=>setKind(value)} style={[styles.chip,kind===value&&styles.chipActive]}><Text style={styles.chipText}>{value==='home'?'Home':'Another place'}</Text></Pressable>)}</View>
        <Text style={styles.label}>District (optional)</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{districts.map((district)=><Pressable key={district.id} onPress={()=>setDistrictId(districtId===district.id?undefined:district.id)} style={[styles.chip,districtId===district.id&&styles.chipActive]}><Text style={styles.chipText}>{district.name}</Text></Pressable>)}</ScrollView></>:null}
        <Text style={styles.label}>Things you can do here</Text><TextInput value={activities} onChangeText={setActivities} maxLength={400} placeholder="Talking, cooking, listening to music" placeholderTextColor={colors.dimmed} style={styles.input}/><Text style={styles.hint}>Separate activities with commas. You can choose one when planning.</Text>
        <Pressable onPress={()=>void pickPhoto()} style={styles.photoButton}><Camera size={18} color={colors.rose}/><Text style={styles.photoText}>{photo?'Change selected image':editing?.custom_image_url?'Replace place image':'Add a place image'}</Text></Pressable>
        {photo?<Image source={{uri:photo.uri}} contentFit="cover" style={styles.preview}/>:editing?.custom_image_url?<Image source={{uri:editing.custom_image_url}} contentFit="cover" style={styles.preview}/>:null}
        {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
        <Pressable disabled={busy} onPress={()=>void save()} style={[styles.primary,busy&&styles.disabled]}>{busy?<ActivityIndicator color="#fff"/>:<><Check size={17} color="#fff"/><Text style={styles.primaryText}>{editing?'Save and choose':'Create and choose'}</Text></>}</Pressable>
        {editing?<>{archiveConfirm?<View style={styles.archivePrompt}><Text style={styles.archiveText}>Archive {editing.name}? Existing memories and finished plans will remain.</Text><Pressable disabled={busy} onPress={()=>void archive()} style={styles.archive}><Trash2 size={15} color={colors.danger}/><Text style={[styles.archiveText,{color:colors.danger}]}>Confirm archive</Text></Pressable><Pressable onPress={()=>setArchiveConfirm(false)} style={styles.back}><Text style={styles.backText}>Keep place</Text></Pressable></View>:<Pressable disabled={busy} onPress={()=>setArchiveConfirm(true)} style={styles.archive}><Trash2 size={15} color={colors.muted}/><Text style={styles.archiveText}>Archive this place</Text></Pressable>}</>:null}
        <Pressable onPress={()=>setFormOpen(false)} style={styles.back}><Text style={styles.backText}>Back to your places</Text></Pressable>
      </>:<><Pressable onPress={startCreate} style={styles.create}><Plus size={18} color={colors.rose}/><Text style={styles.createText}>Create a place</Text></Pressable>
        {places.map((place)=><View key={place.id} style={styles.placeRow}><View style={styles.placeMain}>{place.custom_image_url?<Image source={{uri:place.custom_image_url}} contentFit="cover" style={styles.thumb}/>:<View style={styles.thumbFallback}><MapPin size={20} color={colors.rose}/></View>}<View style={{flex:1}}><Text style={styles.placeName}>{place.name}</Text><Text style={styles.placeDescription} numberOfLines={2}>{place.description}</Text></View><Pressable accessibilityLabel={`Edit ${place.name}`} onPress={()=>startEdit(place)} style={styles.edit}><Text style={styles.editText}>Edit</Text></Pressable></View><View style={styles.activityRow}>{place.possible_activities.map((activity)=><Pressable key={activity} onPress={()=>{onSelect(place,activity);onClose();}} style={styles.activity}><Text style={styles.activityText}>{activity}</Text></Pressable>)}</View></View>)}
        {!places.length?<Text style={styles.empty}>Make a home or favorite spot, then invite someone there.</Text>:null}
        {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}</>}
    </ScrollView>
  </View></KeyboardAvoidingView></Modal>;
}

const styles=StyleSheet.create({
  backdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,.72)'},panel:{maxHeight:'92%',backgroundColor:'#17101F',borderTopLeftRadius:25,borderTopRightRadius:25,borderWidth:1,borderColor:colors.border,paddingBottom:24},header:{flexDirection:'row',alignItems:'flex-start',gap:12,padding:20,borderBottomWidth:1,borderColor:colors.border},title:{color:colors.text,fontFamily:'Georgia',fontSize:26},subtitle:{color:colors.muted,fontSize:12,marginTop:4},icon:{width:36,height:36,alignItems:'center',justifyContent:'center'},content:{padding:20,gap:10},label:{color:colors.text,fontWeight:'800',fontSize:12,marginTop:8},input:{color:colors.text,backgroundColor:'#0E0A15',borderWidth:1,borderColor:colors.border,borderRadius:13,paddingHorizontal:14,paddingVertical:13,fontSize:15},textarea:{minHeight:110,textAlignVertical:'top'},row:{flexDirection:'row',gap:8},chip:{paddingHorizontal:13,paddingVertical:10,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:'#21192A'},chipActive:{borderColor:colors.rose,backgroundColor:'rgba(216,62,234,.18)'},chipText:{color:colors.text,fontWeight:'700',fontSize:12},hint:{color:colors.muted,fontSize:11},photoButton:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:12},photoText:{color:colors.rose,fontWeight:'800',fontSize:12},preview:{width:'100%',height:170,borderRadius:14},error:{color:colors.danger,fontSize:12},primary:{minHeight:48,borderRadius:14,backgroundColor:colors.rose,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginTop:8},primaryText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.5},archivePrompt:{padding:12,borderRadius:12,borderWidth:1,borderColor:colors.danger,gap:4},archive:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,padding:10},archiveText:{color:colors.muted,fontSize:12},back:{alignItems:'center',padding:8},backText:{color:colors.muted,fontSize:12},create:{flexDirection:'row',alignItems:'center',gap:9,padding:15,borderWidth:1,borderColor:colors.rose,borderRadius:14,marginBottom:6},createText:{color:colors.text,fontSize:15,fontWeight:'800'},placeRow:{borderBottomWidth:1,borderColor:colors.border,paddingVertical:11,gap:9},placeMain:{flexDirection:'row',alignItems:'center',gap:11},activityRow:{flexDirection:'row',flexWrap:'wrap',gap:7,marginLeft:71},activity:{paddingHorizontal:10,paddingVertical:7,borderRadius:13,backgroundColor:'rgba(216,62,234,.15)',borderWidth:1,borderColor:'rgba(216,62,234,.35)'},activityText:{color:colors.text,fontSize:11,fontWeight:'800'},thumb:{width:60,height:60,borderRadius:11},thumbFallback:{width:60,height:60,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:'#281C32'},placeName:{color:colors.text,fontSize:15,fontWeight:'800'},placeDescription:{color:colors.muted,fontSize:11,marginTop:4},edit:{padding:10},editText:{color:colors.rose,fontSize:12,fontWeight:'800'},empty:{color:colors.muted,textAlign:'center',padding:22}
});
