import {useCallback,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {BookOpen,ChevronRight,Pause} from 'lucide-react-native';
import {manageScenario} from '../lib/api';
import type {ScenarioSession} from '../lib/scenarios';
import {useScenarioCatalog} from '../hooks/useScenarioCatalog';
import {createClientRequestId} from '../lib/requestId';
import {CreatorModal} from './CreatorPicker';
import {useTogether} from '../store/useTogether';
import {colors} from '../theme';

export function ScenarioConversationBanner({conversationId,scope}:{conversationId:string;scope:string}){
 const {scenarios,error:catalogError,retry:retryCatalog}=useScenarioCatalog();
 const [session,setSession]=useState<ScenarioSession|null>(null),[open,setOpen]=useState(false),[note,setNote]=useState(''),[error,setError]=useState(''),[loadError,setLoadError]=useState(false),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const generation=useRef(0),saving=useRef(false),request=useRef<{note:string;revision:number;id:string}|null>(null);
 const scenarioRevision=useTogether(s=>s.snapshot?.characters.find(c=>c.id===s.snapshot?.conversations.find(v=>v.id===conversationId)?.character_instance_id)?.scenario_state?.sessionId);
 useFocusEffect(useCallback(()=>{
  const epoch=++generation.current;setSession(null);setOpen(false);setNote('');setError('');setLoadError(false);setBusy(false);saving.current=false;request.current=null;
  void manageScenario<{sessions:ScenarioSession[]}>({action:'list'}).then(r=>{if(generation.current===epoch)setSession(r.sessions.find(s=>s.conversation_id===conversationId&&s.status==='active')??null);}).catch(()=>{if(generation.current===epoch)setLoadError(true);});
  return()=>{generation.current++;};
 },[conversationId,scope,reload,scenarioRevision]));
 const scenario=scenarios.find(s=>s.id===session?.scenario_id),chapter=session?.chapter;
 const location=useTogether(s=>s.snapshot?.locations.find(l=>l.id===session?.current_location_id)?.name);
 if(loadError||catalogError)return <Pressable accessibilityRole="button" onPress={()=>{retryCatalog();setReload(v=>v+1);}} style={styles.banner}><BookOpen size={16} color={colors.rose}/><Text style={styles.label}>Story controls unavailable · Retry</Text></Pressable>;
 if(!session||!scenario)return null;
 const save=async(action:'pause'|'complete'|'checkpoint')=>{
  if(saving.current)return;
  saving.current=true;setBusy(true);setError('');const epoch=generation.current;
  try{
   if(!request.current||request.current.note!==note||request.current.revision!==session.revision)request.current={note,revision:session.revision,id:createClientRequestId()};
   const updated=await manageScenario<ScenarioSession>({action,sessionId:session.id,revision:session.revision,...(action==='checkpoint'?{note,requestId:request.current.id}:{})});
   if(generation.current===epoch){setSession(updated.status==='active'?updated:null);setNote('');request.current=null;setOpen(false);void useTogether.getState().refresh({force:true});}
  }catch(e){if(generation.current===epoch)setError(e instanceof Error?e.message:'Your story could not be saved. Try again.');}
  finally{if(generation.current===epoch){saving.current=false;setBusy(false);}}
 };
 const ready=note.trim().length>=10,final=chapter&&chapter.index===chapter.count-1;
 return <>
  <Pressable accessibilityRole="button" accessibilityLabel={`Story: ${scenario.title}. Open progress.`} onPress={()=>setOpen(true)} style={styles.banner}><BookOpen size={16} color={colors.rose}/><Text numberOfLines={1} style={styles.label}>{scenario.title}</Text><Text style={styles.meta}>{chapter?`${chapter.index+1} / ${chapter.count}`:'In progress'}</Text><ChevronRight size={16} color={colors.muted}/></Pressable>
  <CreatorModal visible={open} title={chapter?chapter.arcTitle:scenario.title} onClose={()=>{if(!busy)setOpen(false);}} footer={<>
   {error?<><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>setReload(v=>v+1)} style={styles.button}><Text style={styles.meta}>Reload saved progress</Text></Pressable></>:null}
   <View style={styles.actions}><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void save('pause')} style={styles.button}><Pause size={16} color={colors.text}/><Text style={styles.label}>Pause</Text></Pressable><Pressable accessibilityRole="button" disabled={busy||Boolean(chapter&&!ready)} accessibilityState={{disabled:busy||Boolean(chapter&&!ready),busy}} onPress={()=>void save(chapter?'checkpoint':'complete')} style={[styles.button,styles.primary,(busy||Boolean(chapter&&!ready))&&styles.disabled]}>{busy?<ActivityIndicator color={colors.text}/>:<Text style={styles.label}>{chapter?(final?'Save ending':'Save & continue'):'Mark complete'}</Text>}</Pressable></View>
  </>}>
   <View style={styles.content}><Text style={styles.meta}>With {scenario.leadName} · {location??scenario.locationName}</Text>
    {chapter?<><Text accessibilityRole="header" style={styles.heading}>Chapter {chapter.index+1}: {chapter.title}</Text><Text style={styles.copy}>Play this chapter in chat. When you reach a decision or discovery, record what actually happened to continue. You can leave it open as long as you like.</Text><Text style={styles.label}>{final?'How did this story end?':'What happened in this chapter?'}</Text><TextInput accessibilityLabel="Chapter outcome" multiline maxLength={600} value={note} onChangeText={setNote} placeholder="Record the choice, discovery, or unresolved question you want to carry forward…" placeholderTextColor={colors.muted} style={styles.input}/><Text style={styles.meta}>{note.length}/600 · At least 10 characters</Text>
    {session.story_progress?.checkpoints.map((c,i)=><View key={`${c.savedAt}:${i}`} style={styles.entry}><Text style={styles.label}>Chapter {c.chapterIndex+1}</Text><Text style={styles.copy}>{c.note}</Text></View>)}</>:<Text style={styles.copy}>{scenario.setup}</Text>}
    <Text style={styles.meta}>Their routine is paused during this scenario. You can still plan events. Pausing here keeps your story saved.</Text>
   </View>
  </CreatorModal>
 </>;
}
const styles=StyleSheet.create({banner:{minHeight:44,paddingHorizontal:14,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:9,borderBottomWidth:1,borderBottomColor:colors.border},label:{color:colors.text,fontSize:13,fontWeight:'700',flexShrink:1},meta:{color:colors.muted,fontSize:12,lineHeight:18},content:{gap:14},heading:{fontSize:21,lineHeight:27,color:colors.text,fontWeight:'700'},copy:{fontSize:15,lineHeight:23,color:colors.text},input:{minHeight:110,padding:12,borderWidth:1,borderColor:colors.borderBright,borderRadius:12,fontSize:16,lineHeight:24,color:colors.text,textAlignVertical:'top'},actions:{flexDirection:'row',gap:12},button:{minHeight:46,padding:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:12,borderWidth:1,borderColor:colors.border,flexGrow:1},primary:{backgroundColor:colors.wine},disabled:{opacity:.5},entry:{gap:6,borderTopWidth:1,borderTopColor:colors.border,paddingTop:12},error:{fontSize:13,color:colors.danger,lineHeight:19}});
