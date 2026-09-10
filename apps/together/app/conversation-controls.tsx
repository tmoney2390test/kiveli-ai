import {useEffect,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {ArrowLeft,ChevronRight} from 'lucide-react-native';
import {CharacterAvatar,EmptyState,PageTitle,Screen} from '../src/components';
import {RelationshipControlsModal} from '../src/components/RelationshipControlsModal';
import {useTogether} from '../src/store/useTogether';
import {manageConversation} from '../src/lib/api';
import {navigateLocalRouteOnWeb} from '../src/lib/conversationNavigation';
import type {Conversation} from '../src/types';
import {colors,radius} from '../src/theme';

export default function ConversationControls(){
 const params=useLocalSearchParams<{character?:string;conversationId?:string}>(),{snapshot}=useTogether();
 const [selectedId,setSelectedId]=useState<string|null>(null),[conversation,setConversation]=useState<Conversation|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const focused=snapshot?.characters.find(item=>item.id===params.character||item.together_character_templates.slug===params.character);
 const selected=focused??snapshot?.characters.find(item=>item.id===selectedId);
 useEffect(()=>{if(!selected)return;let cancelled=false;setConversation(null);setError('');const existing=snapshot?.conversations.find(item=>item.character_instance_id===selected.id&&!item.user_archived_at&&!item.archived_at&&(!params.conversationId||item.id===params.conversationId));
 if(existing){setConversation(existing);return;}
 void manageConversation<{conversation:Conversation}>({action:'open',characterInstanceId:selected.id}).then(result=>{if(!cancelled)setConversation(result.conversation);}).catch(caught=>{if(!cancelled)setError(caught instanceof Error?caught.message:'This companion could not be opened.');});return()=>{cancelled=true;};
 },[selected?.id,params.conversationId,attempt]); // Snapshot refreshes must not reopen a dismissed popup.
 const back=()=>router.canGoBack()?router.back():router.replace('/settings');
 const close=()=>{if(focused)back();else setSelectedId(null);};
 const navigate=(href?:string)=>{if(href){if(!navigateLocalRouteOnWeb(href,'replace'))router.replace(href as never);}else close();};
 if(!snapshot)return <EmptyState title="Relationships unavailable" body="Reload Kivelli and try again."/>;
 const companions=snapshot.characters.filter(item=>item.contact_added_at||item.introduced_at||item.relationship_stage!=='stranger'||snapshot.conversations.some(chat=>chat.character_instance_id===item.id&&!chat.user_archived_at));
 return <Screen><View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back}><ArrowLeft color={colors.text}/></Pressable><PageTitle>Relationship controls</PageTitle></View>
  <Text style={styles.copy}>Choose a companion to review reset options.</Text>
  {companions.map(character=><Pressable key={character.id} accessibilityRole="button" accessibilityLabel={`Relationship controls for ${character.together_character_templates.name}`} onPress={()=>setSelectedId(character.id)} style={styles.row}><CharacterAvatar slug={character.together_character_templates.slug} size={44}/><View style={styles.person}><Text style={styles.name}>{character.together_character_templates.name}</Text><Text style={styles.copy}>{character.relationship_stage.replace(/_/g,' ')}</Text></View><ChevronRight size={18} color={colors.muted}/></Pressable>)}
  {selected&&!conversation?<Text style={styles.copy}>{error||'Opening relationship controls…'}</Text>:null}
  {error?<Pressable accessibilityRole="button" onPress={()=>setAttempt(value=>value+1)}><Text style={styles.name}>Retry</Text></Pressable>:null}
  <RelationshipControlsModal visible={Boolean(selected&&conversation)} conversation={conversation} character={selected??null} onClose={close} onReset={navigate}/>
 </Screen>;
}
const styles=StyleSheet.create({header:{flexDirection:'row',alignItems:'center',gap:14},copy:{color:colors.muted,fontSize:13,lineHeight:20},row:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},person:{flex:1,gap:4},name:{color:colors.text,fontSize:16,fontWeight:'700'}});
