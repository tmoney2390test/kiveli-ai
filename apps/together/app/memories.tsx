import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, BellRing, Heart, Pin, Sparkles, Trash2, UserRound } from 'lucide-react-native';
import { CharacterAvatar, EmptyState, PageTitle, Screen } from '../src/components';
import { colors, radius } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { manageConversation, mutateMemory } from '../src/lib/api';
import { activeCompanion } from '../src/lib/companionLife';
import { confirmAction, promptText } from '../src/lib/dialogs';
import type { Memory } from '../src/types';
import { presentMemoryText } from '../src/lib/memoryPresentation';

const tabs = [['About You',['semantic','emotional']],['Preferences',['preference']],['Shared',['episodic']],['Upcoming',['open_thread']],['Relationship',['relationship']]] as const;
const categoryControls: Array<[string,string]> = [['semantic','About you'],['preference','Preferences'],['episodic','Shared experiences'],['emotional','Emotional context'],['open_thread','Upcoming things']];

export default function Memories() {
  const { character: slug } = useLocalSearchParams<{ character?: string }>();
  const { snapshot, refresh } = useTogether();
  const companion = slug ? snapshot?.characters.find((item) => item.together_character_templates.slug === slug||item.together_character_templates.public_handle===slug||item.character_template_id===slug) : snapshot ? activeCompanion(snapshot) : undefined;
  const connections=(snapshot?.characters??[]).filter((item)=>item.contact_added_at||item.introduced_at||snapshot?.memories.some((memory)=>memory.character_instance_id===item.id));
  const name = companion?.together_character_templates.name ?? 'Your companion';
  const memories = (snapshot?.memories ?? []).filter((memory) => memory.character_instance_id === companion?.id);
  const categories = snapshot?.profile?.memory_categories ?? {};
  const update = async (action: string, memory: Memory) => { await mutateMemory({ action, memoryId: memory.id, ...(action === 'pin' ? { pinned: !memory.pinned } : {}) }); await refresh(); };
  const toggleCategory = async (key: string, value: boolean) => { await mutateMemory({ action: 'preferences', categories: { ...categories, [key]: value } }); await refresh(); };
  const edit = (memory: Memory) => promptText({ title: 'Edit memory', initialValue: memory.canonical_text, onSubmit: async (text) => { await mutateMemory({ action: 'edit', memoryId: memory.id, text }); await refresh(); } });
  const menu = (memory: Memory) => Alert.alert('Memory controls', presentMemoryText(memory.canonical_text,name), [{ text: memory.pinned ? 'Unpin' : 'Pin', onPress: () => void update('pin', memory) }, { text: 'Edit', onPress: () => edit(memory) }, { text: 'Forget', style: 'destructive', onPress: () => void update('forget', memory) }, { text: 'Cancel', style: 'cancel' }]);
  const forgetAll = () => companion && confirmAction({ title: `Forget what ${name} remembers?`, message: `${name} will stop using saved facts, preferences, emotional context, and pending follow-ups. Your relationship progress, Moments, Dates, and conversation history will remain.`, confirmLabel: 'Forget memories', destructive: true, onConfirm: () => manageConversation({ action: 'reset', characterInstanceId: companion.id, mode: 'memory' }).then(refresh) });
  return <Screen>
    <View style={styles.header}><Pressable onPress={() => router.back()}><ArrowLeft color={colors.text} /></Pressable><PageTitle>What {name} remembers</PageTitle></View>
    {connections.length>1?<View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}>{connections.map((item)=><Pressable key={item.id} onPress={()=>router.replace(`/memories?character=${item.together_character_templates.slug}` as never)} style={{flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:10,paddingVertical:7,borderRadius:radius.pill,backgroundColor:item.id===companion?.id?'rgba(216,62,234,.12)':colors.surface,borderWidth:1,borderColor:item.id===companion?.id?colors.rose:colors.border}}><CharacterAvatar slug={item.together_character_templates.slug} name={item.together_character_templates.name} size={30}/><Text style={{color:colors.text,fontSize:11,fontWeight:'800'}}>{item.together_character_templates.name}</Text></Pressable>)}</View>:null}
    {memories.length ? tabs.map(([label,types]) => { const group = memories.filter((memory) => types.includes(memory.memory_type as never)); if (!group.length) return null; return <View key={label} style={{ gap: 8 }}><Text style={styles.section}>{label}</Text>{group.map((memory) => <View key={memory.id} style={styles.memory}><Pressable onPress={() => menu(memory)} style={styles.memoryMain}><MemoryIcon type={memory.memory_type} /><Text style={styles.text}>{presentMemoryText(memory.canonical_text,name)}</Text>{memory.pinned ? <Pin size={14} color={colors.rose} fill={colors.rose} /> : null}<Text style={styles.date}>{new Date(memory.updated_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</Text></Pressable>{Platform.OS === 'web' ? <View style={styles.memoryActions}><Pressable onPress={() => void update('pin',memory)}><Text style={styles.memoryAction}>{memory.pinned?'Unpin':'Pin'}</Text></Pressable><Pressable onPress={() => edit(memory)}><Text style={styles.memoryAction}>Edit</Text></Pressable><Pressable onPress={() => void update('forget',memory)}><Text style={[styles.memoryAction,{color:colors.danger}]}>Forget</Text></Pressable></View> : null}</View>)}</View>; }) : <EmptyState title={`${name} is listening`} body="Meaningful details you share will appear here. You stay in control: edit, pin, or forget any memory." />}
    <Text style={styles.section}>Memory preferences</Text>
    {categoryControls.map(([key,label]) => <View key={key} style={styles.control}><Text style={styles.text}>{label}</Text><Switch value={categories[key] !== false} onValueChange={(value) => void toggleCategory(key,value)} trackColor={{ false: colors.elevated, true: colors.rose }} /></View>)}
    {companion ? <Pressable onPress={forgetAll} style={styles.forget}><Trash2 size={18} color={colors.danger} /><View style={{ flex: 1 }}><Text style={styles.forgetTitle}>Forget what {name} remembers</Text><Text style={styles.forgetCopy}>Conversation history and relationship progress stay intact.</Text></View></Pressable> : null}
  </Screen>;
}

function MemoryIcon({type}:{type:string}) { const props={size:18,color:colors.warm};if(type==='preference')return <Heart {...props}/>;if(type==='episodic')return <Sparkles {...props}/>;if(type==='open_thread')return <BellRing {...props}/>;return <UserRound {...props}/>; }
const styles=StyleSheet.create({header:{flexDirection:'row',alignItems:'center',gap:14},section:{color:colors.rose,fontWeight:'800',fontSize:12,letterSpacing:.8,marginTop:8},memory:{minHeight:62,padding:12,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},memoryMain:{flexDirection:'row',alignItems:'center',gap:11},memoryActions:{flexDirection:'row',justifyContent:'flex-end',gap:16,paddingTop:9,marginTop:8,borderTopWidth:1,borderTopColor:colors.border},memoryAction:{color:colors.rose,fontSize:10,fontWeight:'800'},control:{minHeight:54,flexDirection:'row',alignItems:'center',gap:11,paddingHorizontal:12,borderRadius:radius.md,backgroundColor:colors.surface},text:{flex:1,color:colors.text,lineHeight:19},date:{color:colors.muted,fontSize:10},forget:{flexDirection:'row',alignItems:'center',gap:11,padding:14,borderRadius:radius.md,borderWidth:1,borderColor:'rgba(255,107,121,.3)'},forgetTitle:{color:colors.danger,fontWeight:'800'},forgetCopy:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:3}});
