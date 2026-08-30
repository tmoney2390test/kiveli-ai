import{useCallback,useState}from'react';
import{Alert,Pressable,StyleSheet,Text,View}from'react-native';
import{router,useFocusEffect}from'expo-router';
import{Archive,ArrowLeft,ChevronRight,Undo2,Users}from'lucide-react-native';
import{CharacterAvatar,EmptyState,LoadingSkeleton,PageTitle,Screen}from'../src/components';
import{archiveRetentionLabel}from'../src/lib/chatArchive';
import{manageConversation}from'../src/lib/api';
import{confirmAction}from'../src/lib/dialogs';
import{useTogether}from'../src/store/useTogether';
import{colors,radius}from'../src/theme';
import type{Conversation}from'../src/types';

type ArchivedChat=Conversation&{message_count?:number;last_message_preview?:string|null};

export default function ArchivedChats(){
  const{snapshot,refresh}=useTogether();
  const[items,setItems]=useState<ArchivedChat[]>([]);
  const[loading,setLoading]=useState(true);
  const[busyId,setBusyId]=useState<string|null>(null);
  const[error,setError]=useState('');
  const[reloadKey,setReloadKey]=useState(0);

  const load=useCallback(()=>{
    let cancelled=false;
    setLoading(true);
    setError('');
    void manageConversation<ArchivedChat[]>({action:'archived'})
      .then((archived)=>{if(!cancelled)setItems(archived);})
      .catch((caught)=>{if(!cancelled)setError(caught instanceof Error?caught.message:'Archived chats could not be loaded.');})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[reloadKey]);

  useFocusEffect(load);

  const restore=(chat:ArchivedChat)=>{
    const character=snapshot?.characters.find((item)=>item.id===chat.character_instance_id);
    const name=chat.kind==='group'?(chat.title??'this group'):(character?.together_character_templates.name??'this companion');
    const hasCurrent=chat.kind!=='group'&&snapshot?.conversations.some((item)=>item.id!==chat.id&&item.character_instance_id===chat.character_instance_id&&!item.archived_at);
    confirmAction({
      title:`Restore chat with ${name}?`,
      message:hasCurrent?'This transcript will become the current chat. The newer current thread will remain safely available in conversation history.':'This transcript will return to Messages as the current chat.',
      confirmLabel:'Restore chat',
      onConfirm:async()=>{
        setBusyId(chat.id);
        try{
          await manageConversation({action:'restore',conversationId:chat.id});
          setItems((current)=>current.filter((item)=>item.id!==chat.id));
          await refresh();
          Alert.alert('Chat restored',`Your chat with ${name} is back in Messages.`);
        }catch(caught){
          Alert.alert('Could not restore chat',caught instanceof Error?caught.message:'Please try again.');
        }finally{setBusyId(null);}
      },
    });
  };

  if(!snapshot)return <EmptyState title="Archived Chats unavailable" body="Reload Kivelle and try again."/>;
  return <Screen contentStyle={styles.content}>
    <View style={styles.header}><Pressable accessibilityLabel="Back to Settings" onPress={()=>router.canGoBack()?router.back():router.replace('/settings')} style={styles.back}><ArrowLeft color={colors.text}/></Pressable><View style={{flex:1}}><PageTitle>Archived Chats</PageTitle><Text style={styles.subtitle}>Archived chats stay here for 30 days before permanent removal.</Text></View></View>
    <View style={styles.notice}><Archive color={colors.violet}/><View style={{flex:1}}><Text style={styles.noticeTitle}>Recoverable for 30 days</Text><Text style={styles.noticeCopy}>Archived chats leave Messages and conversation history. Restoring one does not change relationship progress, saved memories, or Moments.</Text></View></View>
    {error?<Pressable onPress={()=>setReloadKey((value)=>value+1)} style={styles.error}><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Tap to retry</Text></Pressable>:null}
    {loading&&!items.length?<LoadingSkeleton label="Loading archived chats…"/>:null}
    {!loading&&!items.length?<EmptyState title="No archived chats" body="Chats you archive will be recoverable here for 30 days."/>:null}
    <View style={styles.list}>{items.map((chat)=>{
      const character=snapshot.characters.find((item)=>item.id===chat.character_instance_id);
      const template=character?.together_character_templates;
      const name=chat.kind==='group'?(chat.title??'Group chat'):(template?.name??'Unavailable companion');
      const busy=busyId===chat.id;
      return <View key={chat.id} style={[styles.card,busy&&styles.busy]}>
        <Pressable accessibilityLabel={`Open archived chat with ${name}`} disabled={busy} onPress={()=>router.push(`/conversation/${chat.id}` as never)} style={({pressed})=>[styles.cardMain,pressed&&styles.pressed]}>
          {chat.kind==='group'?<View style={styles.fallback}><Users size={21} color={colors.violet}/></View>:character?<CharacterAvatar slug={template!.slug} name={name} template={template} version={character.together_character_versions} size={52}/>:<View style={styles.fallback}><Archive size={21} color={colors.violet}/></View>}
          <View style={styles.copy}><View style={styles.nameRow}><Text numberOfLines={1} style={styles.name}>{name}</Text><ChevronRight size={17} color={colors.dimmed}/></View><Text numberOfLines={2} style={styles.preview}>{chat.last_message_preview??'No messages in this chat.'}</Text><Text style={styles.meta}>{chat.message_count??0} {(chat.message_count??0)===1?'message':'messages'} · {archiveRetentionLabel(chat.restore_until)}</Text></View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Restore chat with ${name}`} disabled={busy} onPress={()=>restore(chat)} style={({pressed})=>[styles.restore,pressed&&styles.pressed]}><Undo2 size={16} color="#fff"/><Text style={styles.restoreText}>{busy?'Restoring…':'Restore'}</Text></Pressable>
      </View>;
    })}</View>
  </Screen>;
}

const styles=StyleSheet.create({
  content:{width:'100%',maxWidth:760,alignSelf:'center',paddingBottom:80},
  header:{flexDirection:'row',alignItems:'flex-start',gap:13},
  back:{width:40,height:40,alignItems:'center',justifyContent:'center',borderRadius:20,backgroundColor:colors.surface},
  subtitle:{color:colors.muted,fontSize:11,lineHeight:17,marginTop:4},
  notice:{flexDirection:'row',alignItems:'flex-start',gap:12,padding:16,borderRadius:radius.lg,backgroundColor:'rgba(154,104,255,.08)',borderWidth:1,borderColor:'rgba(154,104,255,.22)'},
  noticeTitle:{color:colors.text,fontSize:13,fontWeight:'900'},
  noticeCopy:{color:colors.muted,fontSize:11,lineHeight:17,marginTop:4},
  list:{gap:10},
  card:{padding:13,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,gap:11},
  cardMain:{minWidth:0,flexDirection:'row',alignItems:'center',gap:13},
  copy:{minWidth:0,flex:1},
  nameRow:{flexDirection:'row',alignItems:'center',gap:8},
  name:{minWidth:0,flex:1,color:colors.text,fontSize:16,fontWeight:'900'},
  preview:{color:colors.muted,fontSize:12,lineHeight:17,marginTop:5},
  meta:{color:colors.violet,fontSize:10,fontWeight:'800',marginTop:7},
  fallback:{width:52,height:52,borderRadius:26,alignItems:'center',justifyContent:'center',backgroundColor:colors.elevated},
  restore:{minHeight:43,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,borderRadius:radius.md,backgroundColor:colors.rose},
  restoreText:{color:'#fff',fontSize:12,fontWeight:'900'},
  busy:{opacity:.55},
  pressed:{opacity:.7},
  error:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,padding:13,borderRadius:radius.md,backgroundColor:'rgba(255,113,129,.08)',borderWidth:1,borderColor:'rgba(255,113,129,.22)'},
  errorText:{minWidth:0,flex:1,color:colors.danger,fontSize:11},
  retry:{color:colors.text,fontSize:10,fontWeight:'900'},
});
