import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import * as Crypto from 'expo-crypto';
import { Screen, LoadingSkeleton } from '../../src/components';
import { invoke } from '../../src/lib/api';
import { useTogether } from '../../src/store/useTogether';
import { storyReturnDate, storyStatusLabel } from '../../src/lib/worldStoryPresentation';
import { colors, typography } from '../../src/theme';
type Story={slug:string;title:string;opening:string;status:string;stage:number;stageCount:number;scene:string|null;chapterTitle:string|null;summary:string|null;declineOption:string;choices:Array<{id:string;label:string;needsReturnDate?:boolean;needsNewBase?:boolean}>;evidence:Array<{id:string;title:string;discovered:boolean;detail?:string|null}>};
type Library={version:number;stories:Story[];newBases:Array<{id:string;name:string}>};
export default function WorldStories(){
  const {snapshot}=useTogether();
  return <StoryLibrary key={snapshot?.activeContinuity?.id??'loading'}/>;
}
function StoryLibrary(){
  const [library,setLibrary]=useState<Library|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[errorStory,setErrorStory]=useState('');
  const {refresh}=useTogether();
  const[forms,setForms]=useState<Record<string,{returnDate?:string;newBase?:string}>>({}),[filter,setFilter]=useState<'all'|'active'|'completed'>('all'),[pendingSlug,setPendingSlug]=useState('');
  const saving=useRef(false);
  const setForm=(slug:string,patch:{returnDate?:string;newBase?:string})=>setForms(current=>({...current,[slug]:{...current[slug],...patch}}));
  const load=()=>invoke<Library>('together-world-story',{action:'library'}).then(setLibrary).catch(e=>setError(e.message));
  useEffect(()=>{let cancelled=false;void invoke<Library>('together-world-story',{action:'library'}).then(value=>{if(!cancelled)setLibrary(value);}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[]);
  const choose=async(story:Story,type:string,choiceId?:string)=>{
    if(!library||saving.current)return;
    setErrorStory(story.slug);
    const selected=story.choices.find(c=>c.id===choiceId),form=forms[story.slug]??{};
    let returnAt:string|undefined;
    try {
      if(selected?.needsReturnDate)returnAt=storyReturnDate(form.returnDate??'');
      if(selected?.needsNewBase&&!library.newBases.some(base=>base.id===form.newBase))throw new Error('Choose the district you agreed to settle in.');
    } catch(e) {setError(e instanceof Error?e.message:'Check your choice.');return;}
    saving.current=true;setBusy(true);setPendingSlug(story.slug);setError('');
    try{setLibrary(await invoke<Library>('together-world-story',{action:'choose',expectedVersion:library.version,requestId:Crypto.randomUUID(),choice:{type,arcSlug:story.slug,...(choiceId?{choiceId}:{}),...(returnAt?{returnAt}:{}),...(selected?.needsNewBase?{locationId:form.newBase}:{})}}));void refresh();}
    catch(e){setError(e instanceof Error?e.message:'The choice could not be saved.');await load();}
    finally{saving.current=false;setBusy(false);setPendingSlug('');}
  };
  if(!library&&!error)return <LoadingSkeleton label="Opening stories…"/>;
  return <Screen contentStyle={styles.screen}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Calder's Run" onPress={()=>router.canGoBack()?router.back():router.replace('/world/places?world=calders-run' as never)} style={styles.back}><ArrowLeft size={22} color={colors.text}/></Pressable>
    <Text style={styles.eyebrow}>CALDER’S RUN · 1888</Text><Text style={styles.title}>A town worth staying for</Text><Text style={styles.intro}>Follow the people and choices that shape your life here. Your progress stays with this Persona’s life.</Text>
    {error&&!errorStory?<View accessibilityRole="alert" style={styles.errorPanel}><Text style={styles.error}>{error}</Text><Action label="Reload stories" disabled={busy} onPress={()=>{setError('');void load();}}/></View>:null}
    <View accessibilityRole="tablist" style={styles.filters}>{(['all','active','completed'] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:filter===value}} onPress={()=>setFilter(value)} style={[styles.filter,filter===value&&styles.filterSelected]}><Text style={styles.actionText}>{value==='all'?'All stories':value==='active'?'In progress':'Completed'}</Text></Pressable>)}</View>
    {library&&!library.stories.some(story=>filter==='all'||(filter==='active'?['active','paused'].includes(story.status):story.status==='completed'))?<Text style={styles.body}>{filter==='completed'?'Completed stories will appear here.':'Begin a story from All stories to see it here.'}</Text>:null}
    {library?.stories.filter(story=>filter==='all'||(filter==='active'?['active','paused'].includes(story.status):story.status==='completed')).map(story=><View key={story.slug} style={styles.card}>
      <Text style={styles.status}>{storyStatusLabel(story.status)}</Text>
      {error&&errorStory===story.slug?<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>:null}<Text accessibilityRole="header" style={styles.name}>{story.title}</Text>
      {pendingSlug===story.slug?<Text accessibilityLiveRegion="polite" style={styles.chapter}>Saving your choice…</Text>:null}
      <Text style={styles.body}>{story.status==='completed'?story.summary??story.opening:story.scene??story.opening}</Text>
      {story.chapterTitle&&story.status!=='completed'?<Text style={styles.chapter}>{story.chapterTitle} · {story.stage} of {story.stageCount}</Text>:null}
      {story.evidence.map(clue=><View key={clue.id}><Text style={styles.body}>{clue.title}{clue.discovered?' · Discovered':''}</Text>{clue.detail?<Text style={styles.body}>{clue.detail}</Text>:null}{!clue.discovered?<Action label="Discuss this evidence" disabled={busy} onPress={()=>void choose(story,'investigate',clue.id)}/>:null}</View>)}
      {story.choices.some(c=>c.needsReturnDate)?<View><Text style={styles.body}>Planned return date</Text><TextInput accessibilityLabel="Planned return date" placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} value={forms[story.slug]?.returnDate??''} onChangeText={value=>setForm(story.slug,{returnDate:value})} maxLength={10} autoCapitalize="none" style={[styles.action,styles.body]}/></View>:null}
      {story.choices.some(c=>c.needsNewBase)?<View><Text style={styles.body}>Agree a new district to settle in</Text>{library.newBases.map(base=><Pressable key={base.id} accessibilityRole="radio" accessibilityState={{checked:forms[story.slug]?.newBase===base.id}} onPress={()=>setForm(story.slug,{newBase:base.id})} style={styles.action}><Text style={styles.actionText}>{forms[story.slug]?.newBase===base.id?'✓ ':''}{base.name}</Text></Pressable>)}</View>:null}
      {story.status==='active'?<Text style={styles.guidance}>{story.choices.length?'Choose what happens next. This choice will be saved to your life here.':story.evidence.some(clue=>!clue.discovered)?'Discuss these leads with the people involved. Some discoveries require meeting them in the right place.':'Continue when you are ready, or pause and come back later.'}</Text>:story.status==='paused'?<Text style={styles.guidance}>Your place is saved. Resume whenever you are ready.</Text>:null}
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
const styles=StyleSheet.create({filters:{flexDirection:'row',flexWrap:'wrap',gap:8},filter:{minHeight:44,paddingHorizontal:15,justifyContent:'center',borderRadius:22,borderWidth:1,borderColor:colors.border},filterSelected:{backgroundColor:colors.surface,borderColor:colors.rose},status:{color:colors.rose,fontSize:11,fontWeight:'800',letterSpacing:.6},guidance:{color:colors.muted,fontSize:13,lineHeight:20},errorPanel:{gap:10},screen:{width:'100%',maxWidth:880,alignSelf:'center',padding:20,gap:16,paddingBottom:70},back:{width:44,height:44,justifyContent:'center'},eyebrow:{color:colors.rose,fontSize:11,fontWeight:'800',letterSpacing:2},title:{color:colors.text,fontFamily:typography.display,fontSize:36},intro:{color:colors.muted,fontSize:15,lineHeight:23},card:{padding:18,borderRadius:20,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,gap:12},name:{color:colors.text,fontFamily:typography.display,fontSize:27},body:{color:colors.text,fontSize:15,lineHeight:24},chapter:{color:colors.muted,fontSize:12,lineHeight:18},actions:{flexDirection:'row',flexWrap:'wrap',gap:10},action:{minHeight:44,justifyContent:'center',paddingHorizontal:16,paddingVertical:10,borderRadius:12,borderWidth:1,borderColor:colors.rose},actionText:{color:colors.text,fontWeight:'700',fontSize:13},error:{color:'#FF9BA7',fontSize:14}});
