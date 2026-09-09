import {useCallback,useState} from 'react';
import {Pressable,StyleSheet,Text} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {BookOpen} from 'lucide-react-native';
import {manageScenario} from '../lib/api';
import type {ScenarioSession} from '../lib/scenarios';
import {scenarios} from '../lib/scenarioCatalog';
import {CreatorModal} from './CreatorPicker';
import {colors} from '../theme';

export function ScenarioConversationBanner({conversationId,scope}:{conversationId:string;scope:string}){
 const [session,setSession]=useState<ScenarioSession|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useFocusEffect(useCallback(()=>{let live=true;setSession(null);setOpen(false);setError('');void manageScenario<{sessions:ScenarioSession[]}>({action:'list'}).then(r=>{if(live)setSession(r.sessions.find(s=>s.conversation_id===conversationId&&s.status==='active')??null);}).catch(()=>{});return()=>{live=false;};},[conversationId,scope]));
 const scenario=scenarios.find(s=>s.id===session?.scenario_id);
 if(!scenario||!session)return null;
 const save=async(action:'pause'|'complete')=>{if(busy)return;setBusy(true);setError('');try{await manageScenario({action,sessionId:session.id});setSession(null);setOpen(false);}catch(e){setError(e instanceof Error?e.message:'Your scenario could not be saved.');}finally{setBusy(false);}};
 return <><Pressable accessibilityRole="button" accessibilityLabel={`Scenario: ${scenario.title}. Open scenario controls.`} onPress={()=>setOpen(true)} style={styles.banner}><BookOpen size={16} color={colors.rose}/><Text numberOfLines={1} style={styles.label}>{scenario.title}</Text><Text style={styles.manage}>Scenario</Text></Pressable><CreatorModal visible={open} title={scenario.title} onClose={()=>{if(!busy)setOpen(false);}}><Text style={styles.copy}>{scenario.setup}</Text><Text style={styles.note}>Your conversation is saved. Pause the scenario to return to ordinary chat, or mark it complete when your story feels finished.</Text>{error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void save('pause')} style={styles.action}><Text style={styles.label}>Pause scenario</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void save('complete')} style={styles.action}><Text style={styles.label}>Mark complete</Text></Pressable></CreatorModal></>;
}
const styles=StyleSheet.create({banner:{minHeight:40,paddingHorizontal:14,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:9,backgroundColor:colors.surface},label:{flex:1,fontSize:13,color:colors.text,fontWeight:'700'},manage:{fontSize:11,color:colors.muted},copy:{fontSize:16,lineHeight:25,color:colors.text},note:{fontSize:13,lineHeight:20,color:colors.muted,marginVertical:18},action:{minHeight:48,padding:14,borderRadius:12,borderWidth:1,borderColor:colors.border,marginTop:10},error:{color:colors.danger}});
