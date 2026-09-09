import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import * as Crypto from 'expo-crypto';
import { Screen, LoadingSkeleton } from '../../src/components';
import { invoke } from '../../src/lib/api';
import { useTogether } from '../../src/store/useTogether';
import { colors, typography } from '../../src/theme';
type Story={slug:string;title:string;opening:string;status:string;stage:number;stageCount:number;scene:string|null;chapterTitle:string|null;summary:string|null;declineOption:string;choices:Array<{id:string;label:string;needsReturnDate?:boolean;needsNewBase?:boolean}>;evidence:Array<{id:string;title:string;discovered:boolean;detail?:string|null}>};
type Library={version:number;stories:Story[];newBases:Array<{id:string;name:string}>};
export default function WorldStories(){
  const [library,setLibrary]=useState<Library|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const {refresh}=useTogether();
  const[returnDate,setReturnDate]=useState(''),[newBase,setNewBase]=useState('');
  const load=()=>invoke<Library>('together-world-story',{action:'library'}).then(setLibrary).catch(e=>setError(e.message));
  useEffect(()=>{void load();},[]);
  const choose=async(story:Story,type:string,choiceId?:string)=>{
    if(!library||busy)return;setBusy(true);setError('');
    const selected=story.choices.find(c=>c.id===choiceId);
    if(selected?.needsReturnDate&&!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)){setError('Enter a planned return date in YYYY-MM-DD format.');setBusy(false);return;}
    try{setLibrary(await invoke<Library>('together-world-story',{action:'choose',expectedVersion:library.version,requestId:Crypto.randomUUID(),choice:{type,arcSlug:story.slug,...(choiceId?{choiceId}:{}),...(selected?.needsReturnDate?{returnAt:new Date(`${returnDate}T12:00:00`).toISOString()}:{}),...(selected?.needsNewBase?{locationId:newBase}:{})}}));void refresh();}
    catch(e){setError(e instanceof Error?e.message:'The choice could not be saved.');await load();}
    finally{setBusy(false);}
  };
  if(!library&&!error)return <LoadingSkeleton label="Opening stories…"/>;
  return <Screen contentStyle={styles.screen}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Calder's Run" onPress={()=>router.canGoBack()?router.back():router.replace('/world/places?world=calders-run' as never)} style={styles.back}><ArrowLeft size={22} color={colors.text}/></Pressable>
    <Text style={styles.eyebrow}>CALDER’S RUN · 1888</Text><Text style={styles.title}>A town worth staying for</Text><Text style={styles.intro}>Follow the people and choices that shape your life here. Your progress stays with this Persona’s life.</Text>
    {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
    {library?.stories.map(story=><View key={story.slug} style={styles.card}>
      <Text style={styles.name}>{story.title}</Text>
      <Text style={styles.body}>{story.summary??story.scene??story.opening}</Text>
      {story.chapterTitle&&story.status!=='completed'?<Text style={styles.chapter}>{story.chapterTitle} · {story.stage} of {story.stageCount}</Text>:null}
      {story.evidence.map(clue=><View key={clue.id}><Text style={styles.body}>{clue.title}{clue.discovered?' · Discovered':''}</Text>{clue.detail?<Text style={styles.body}>{clue.detail}</Text>:null}{!clue.discovered?<Action label="Discuss this evidence" disabled={busy} onPress={()=>void choose(story,'investigate',clue.id)}/>:null}</View>)}
      {story.choices.some(c=>c.needsReturnDate)?<View><Text style={styles.body}>Planned return date</Text><TextInput accessibilityLabel="Planned return date" placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} value={returnDate} onChangeText={setReturnDate} style={[styles.action,styles.body]}/></View>:null}
      {story.choices.some(c=>c.needsNewBase)?<View><Text style={styles.body}>Agree a new district to settle in</Text>{library.newBases.map(base=><Pressable key={base.id} accessibilityRole="radio" accessibilityState={{checked:newBase===base.id}} onPress={()=>setNewBase(base.id)} style={styles.action}><Text style={styles.actionText}>{newBase===base.id?'✓ ':''}{base.name}</Text></Pressable>)}</View>:null}
      <View style={styles.actions}>
        {story.status==='unstarted'?<Action label="Begin this story" disabled={busy} onPress={()=>void choose(story,'start')}/>:null}
        {story.status==='paused'?<Action label="Resume story" disabled={busy} onPress={()=>void choose(story,'resume')}/>:null}
        {story.status==='active'&&story.stage<story.stageCount?<Action label={story.slug==='the-crowcut-reckoning'&&story.stage===1?'Accept the invitation to Crowcut':'Continue the story'} disabled={busy} onPress={()=>void choose(story,'advance')}/>:null}
        {story.choices.map(choice=><Action key={choice.id} label={choice.label} disabled={busy} onPress={()=>void choose(story,'resolve',choice.id)}/>)}
        {story.status==='active'?<Action label="Pause for now" disabled={busy} onPress={()=>void choose(story,'pause')}/>:null}
        {story.status==='completed'?<Text style={styles.chapter}>Part of your story</Text>:null}
      </View>
    </View>)}
  </Screen>;
}
function Action({label,disabled,onPress}:{label:string;disabled:boolean;onPress:()=>void}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action,disabled&&{opacity:.5}]}><Text style={styles.actionText}>{label}</Text></Pressable>;}
const styles=StyleSheet.create({screen:{maxWidth:880,padding:24,gap:16,paddingBottom:70},back:{width:44,height:44,justifyContent:'center'},eyebrow:{color:colors.rose,fontSize:11,fontWeight:'800',letterSpacing:2},title:{color:colors.text,fontFamily:typography.display,fontSize:36},intro:{color:colors.muted,fontSize:15,lineHeight:23},card:{padding:22,borderRadius:20,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,gap:12},name:{color:colors.text,fontFamily:typography.display,fontSize:27},body:{color:colors.text,fontSize:15,lineHeight:24},chapter:{color:colors.muted,fontSize:12,lineHeight:18},actions:{flexDirection:'row',flexWrap:'wrap',gap:10},action:{minHeight:44,justifyContent:'center',paddingHorizontal:16,paddingVertical:10,borderRadius:12,borderWidth:1,borderColor:colors.rose},actionText:{color:colors.text,fontWeight:'700',fontSize:13},error:{color:'#FF9BA7',fontSize:14}});
