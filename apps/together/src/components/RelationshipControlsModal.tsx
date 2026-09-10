import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {ArrowLeft,BookOpen,ChevronRight,Heart,MessageCircle,RotateCcw,Trash2,X} from 'lucide-react-native';
import {FrostedSurface} from './FrostedGlass';
import {manageConversation,manageScenario,previewCharacterReset,startOverCharacter} from '../lib/api';
import {createClientRequestId} from '../lib/requestId';
import {clearConversationMessageWarmup} from '../lib/conversationMessageWarmup';
import {useTogether} from '../store/useTogether';
import type {CharacterInstance,CharacterResetPreview,Conversation} from '../types';
import type {ScenarioSession} from '../lib/scenarios';
import {colors,radius,spacing,typography} from '../theme';

type ResetMode='relationship'|'full'|'scenario'|'conversation';
type Props={visible:boolean;conversation:Conversation|null;character:CharacterInstance|null;onClose:()=>void;onReset:(href?:string)=>void};
export function RelationshipControlsModal({visible,conversation,character,onClose,onReset}:Props){
 const [mode,setMode]=useState<ResetMode|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmation,setConfirmation]=useState('');
 const [scenario,setScenario]=useState<ScenarioSession|null>(null),[loadingScenario,setLoadingScenario]=useState(false),[scenarioError,setScenarioError]=useState(''),[attempt,setAttempt]=useState(0);
 const [preview,setPreview]=useState<CharacterResetPreview|null>(null),[previewLoading,setPreviewLoading]=useState(false);
 const requestId=useRef(createClientRequestId()),inFlight=useRef(false);
 useEffect(()=>{if(!visible)return;setMode(null);setConfirmation('');setError('');setPreview(null);requestId.current=createClientRequestId();},[visible,conversation?.id]);
 useEffect(()=>{if(!visible||!conversation)return;let cancelled=false;setScenario(null);setScenarioError('');setLoadingScenario(true);
  void manageScenario<{sessions:ScenarioSession[]}>({action:'list'}).then(result=>{if(!cancelled)setScenario(result.sessions.find(s=>s.conversation_id===conversation.id&&s.status==='active')??result.sessions.find(s=>s.conversation_id===conversation.id)??null);}).catch(caught=>{if(!cancelled)setScenarioError(caught instanceof Error?caught.message:'Scenarios could not be loaded.');}).finally(()=>{if(!cancelled)setLoadingScenario(false);});return()=>{cancelled=true;};
 },[visible,conversation?.id,attempt]);
 useEffect(()=>{if(mode!=='full'||!character)return;let cancelled=false;setPreview(null);setPreviewLoading(true);void previewCharacterReset(character.id).then(value=>{if(!cancelled)setPreview(value);}).catch(caught=>{if(!cancelled)setError(caught instanceof Error?caught.message:'Reset preview unavailable.');}).finally(()=>{if(!cancelled)setPreviewLoading(false);});return()=>{cancelled=true;};},[mode,character?.id,attempt]);
 if(!character||!conversation)return null;
 const name=character.together_character_templates.name;
 const descriptions:Record<ResetMode,{title:string;copy:string;confirm:string}>={
  relationship:{title:'Reset relationship progress',copy:`Your relationship with ${name} returns to the beginning and Dates relock. Messages, memories, Moments and photos remain.`,confirm:'Reset progress'},
  full:{title:`Start over with ${name}`,copy:'Permanently erase your complete shared history with this companion: conversations, memories, plans, Dates, Moments, stories, scenes and relationship-generated photos. Other companions and your Life remain.',confirm:'Start over'},
  scenario:{title:'Reset scenario',copy:'Permanently clear this chat and restart its scenario at the opening and original location. Relationship progress, shared memories, plans, Moments and other conversations remain.',confirm:'Reset scenario'},
  conversation:{title:'Reset current conversation',copy:'Permanently clear this chat’s messages, uploaded attachments and conversation context. Relationship progress, shared memories, plans, Moments and other conversations remain. Any scenario keeps its current progress and location.',confirm:'Reset conversation'},
 };
 const choose=(next:ResetMode)=>{setMode(next);setError('');setConfirmation('');requestId.current=createClientRequestId();};
 const close=()=>{if(!inFlight.current)onClose();};
 const reset=async()=>{
  if(!mode||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
  try{
   let href:string|undefined;
   if(mode==='full'){const result=await startOverCharacter(character.id,requestId.current);href=`/chat?character=${result.newCharacterInstanceId}&conversationId=${result.conversationId}`;}
   else if(mode==='relationship')await manageConversation({action:'reset',characterInstanceId:character.id,mode:'relationship'});
   else{const result=await manageConversation<{conversationId:string;characterInstanceId:string}>({action:'reset_chat',conversationId:conversation.id,mode,requestId:requestId.current,...(mode==='scenario'?{scenarioSessionId:scenario?.id}:{})});href=`/chat?character=${result.characterInstanceId}&conversationId=${result.conversationId}`;}
   clearConversationMessageWarmup();await useTogether.getState().refresh({force:true});onReset(href);
  }catch(caught){setError(caught instanceof Error?caught.message:'Reset unavailable. Please try again.');}finally{inFlight.current=false;setBusy(false);}
 };
 const detail=mode?descriptions[mode]:null;
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
  <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.root}>
   <Pressable accessibilityLabel="Close relationship controls" onPress={close} disabled={busy} style={StyleSheet.absoluteFill}/>
   <FrostedSurface intensity={92} style={styles.card}>
    <View style={styles.header}>{mode?<Pressable accessibilityRole="button" accessibilityLabel="Back to relationship controls" disabled={busy} onPress={()=>{setMode(null);setError('');}} style={styles.close}><ArrowLeft size={20} color={colors.text}/></Pressable>:null}<Text accessibilityRole="header" style={styles.title}>{mode?'Confirm reset':'Relationship controls'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close relationship controls" disabled={busy} onPress={close} style={styles.close}><X size={21} color={colors.muted}/></Pressable></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
     {!mode?<><Text style={styles.subtitle}>{name} · {character.relationship_stage.replace(/_/g,' ')}</Text>
      <Action title="Reset relationship progress" body="Restart progression and Dates. Keep messages and shared history." icon={<Heart size={20} color={colors.warm}/>} onPress={()=>choose('relationship')}/>
      <Action title={`Start over with ${name}`} body="Erase your complete shared history with this companion." icon={<Trash2 size={20} color={colors.danger}/>} danger onPress={()=>choose('full')}/>
      <Action title="Reset scenario" body={loadingScenario?'Checking this conversation…':scenario?'Restart this scenario and its chat. Keep relationship progress.':'Available in a conversation with a scenario.'} icon={<BookOpen size={20} color={colors.violet}/>} disabled={!scenario||loadingScenario} onPress={()=>choose('scenario')}/>
      {scenarioError?<View><Text accessibilityRole="alert" style={styles.error}>{scenarioError}</Text><Pressable accessibilityRole="button" onPress={()=>setAttempt(value=>value+1)}><Text style={styles.retry}>Retry scenario check</Text></Pressable></View>:null}
      <Action title="Reset current conversation" body="Clear this chat. Keep relationship progress and shared memories." icon={<MessageCircle size={20} color={colors.rose}/>} onPress={()=>choose('conversation')}/>
     </>:detail?<><View style={styles.detailTitle}><RotateCcw size={21} color={colors.warm}/><Text style={styles.heading}>{detail.title}</Text></View><Text style={styles.copy}>{detail.copy}</Text>
      {mode==='full'?<>{previewLoading?<ActivityIndicator color={colors.rose}/>:preview?<View style={styles.preview}><Text style={styles.copy}>{preview.counts.conversations} conversations · {preview.counts.memories} memories · {preview.counts.moments} Moments</Text><Text style={styles.copy}>{preview.counts.upcomingPlans+preview.counts.historicalPlans} plans · {preview.counts.dates} Dates · {preview.counts.photos} photos</Text></View>:<Pressable accessibilityRole="button" onPress={()=>setAttempt(value=>value+1)}><Text style={styles.retry}>Retry reset preview</Text></Pressable>}<Text style={styles.copy}>Type START OVER to confirm</Text><TextInput accessibilityLabel="Type START OVER to confirm" value={confirmation} onChangeText={setConfirmation} editable={!busy} autoCapitalize="characters" placeholder="START OVER" placeholderTextColor={colors.dimmed} style={styles.input}/></>:null}
     </>:null}
     {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
    </ScrollView>
    {mode&&detail?<View style={styles.footer}><Pressable accessibilityRole="button" disabled={busy} onPress={()=>{setMode(null);setError('');}} style={styles.cancel}><Text style={styles.buttonText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={detail.confirm} disabled={busy||(mode==='full'&&(confirmation!=='START OVER'||previewLoading||!preview))} onPress={()=>void reset()} style={[styles.confirm,(busy||(mode==='full'&&(confirmation!=='START OVER'||previewLoading||!preview)))&&styles.disabled]}><Text style={styles.buttonText}>{busy?'Resetting…':detail.confirm}</Text></Pressable></View>:null}
   </FrostedSurface>
  </KeyboardAvoidingView>
 </Modal>;
}
function Action({title,body,icon,danger,disabled,onPress}:{title:string;body:string;icon:React.ReactNode;danger?:boolean;disabled?:boolean;onPress:()=>void}){return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled:Boolean(disabled)}} disabled={disabled} onPress={onPress} style={[styles.action,disabled&&styles.disabled]}>{icon}<View style={styles.actionCopy}><Text style={[styles.actionTitle,danger&&{color:colors.danger}]}>{title}</Text><Text style={styles.actionBody}>{body}</Text></View><ChevronRight size={17} color={colors.muted}/></Pressable>;}
const styles=StyleSheet.create({root:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.md,backgroundColor:'rgba(3,2,7,.74)'},card:{width:'100%',maxWidth:650,maxHeight:'92%',overflow:'hidden',borderRadius:radius.xl,backgroundColor:'rgba(31,24,42,.985)',borderColor:'rgba(190,115,255,.30)'},header:{minHeight:67,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:spacing.lg,borderBottomWidth:1,borderBottomColor:colors.border},title:{flex:1,color:colors.text,fontFamily:typography.display,fontSize:25,fontWeight:'700'},close:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.045)'},content:{gap:12,padding:spacing.lg,paddingBottom:24},subtitle:{color:colors.muted,fontSize:13,lineHeight:20,marginBottom:4},action:{flexDirection:'row',alignItems:'center',gap:12,padding:15,minHeight:82,borderRadius:radius.md,backgroundColor:'rgba(255,255,255,.035)',borderWidth:1,borderColor:colors.border},actionCopy:{flex:1,gap:5},actionTitle:{color:colors.text,fontSize:15,fontWeight:'700',lineHeight:20},actionBody:{color:colors.muted,fontSize:12,lineHeight:18},copy:{color:colors.muted,fontSize:14,lineHeight:22},detailTitle:{flexDirection:'row',alignItems:'center',gap:10},heading:{flex:1,color:colors.text,fontSize:21,lineHeight:28,fontWeight:'700'},preview:{padding:12,borderRadius:radius.md,backgroundColor:colors.surface},input:{minHeight:48,paddingHorizontal:13,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,color:colors.text},footer:{flexDirection:'row',gap:10,padding:spacing.lg,borderTopWidth:1,borderTopColor:colors.border},cancel:{flex:1,minHeight:48,justifyContent:'center',alignItems:'center',borderRadius:radius.md,backgroundColor:colors.surface},confirm:{flex:1,minHeight:48,justifyContent:'center',alignItems:'center',borderRadius:radius.md,backgroundColor:colors.danger,paddingHorizontal:8},buttonText:{color:'#fff',fontSize:14,fontWeight:'700',textAlign:'center'},disabled:{opacity:.4},error:{color:colors.danger,fontSize:13,lineHeight:20},retry:{color:colors.rose,paddingVertical:10,fontSize:13,fontWeight:'700'}});
