import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {Image} from 'expo-image';
import {router} from 'expo-router';
import {BookOpen,ChevronRight,MapPin} from 'lucide-react-native';
import {CreatorModal} from './CreatorPicker';
import {scenarios,type Scenario} from '../lib/scenarioCatalog';
import {scenarioAssets} from '../scenario-assets';
import {scenarioAvailable,startScenario,type ScenarioSession} from '../lib/scenarios';
import {manageScenario} from '../lib/api';
import {useTogether} from '../store/useTogether';
import {colors} from '../theme';

export function ScenarioBrowser({worldId,gender='any',onboarding=false,limit,query:externalQuery}:{worldId:string;gender?:string;onboarding?:boolean;limit?:number;query?:string}){
 const snapshot=useTogether(s=>s.snapshot),scope=snapshot?.activeContinuity?.id;
 const [selected,setSelected]=useState<Scenario|null>(null),[query,setQuery]=useState(''),[sessions,setSessions]=useState<ScenarioSession[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const saving=useRef(false),scopeRef=useRef(scope);scopeRef.current=scope;
 useEffect(()=>{let live=true;setSessions([]);setSelected(null);setError('');if(!onboarding)void manageScenario<{sessions:ScenarioSession[]}>({action:'list'}).then(r=>{if(live)setSessions(r.sessions);}).catch(()=>{/* Browsing remains available; start is idempotent. */});return()=>{live=false;};},[scope,onboarding]);
 if(!snapshot)return null;
 const term=(externalQuery??query).trim().toLowerCase();
 const choices=scenarios.filter(s=>s.worldId===worldId&&(gender==='any'||gender==='all'||s.gender===(gender==='women'||gender==='woman'?'female':gender==='men'||gender==='man'?'male':gender))&&(!term||[s.title,s.leadName,s.locationName,...s.themes,s.setup].join(' ').toLowerCase().includes(term)));
 const existing=selected?sessions.find(s=>s.scenario_id===selected.id):undefined;
 const available=selected?scenarioAvailable(selected,snapshot):false;
 const start=async()=>{if(!selected||saving.current)return;const currentScope=scopeRef.current;saving.current=true;setBusy(true);setError('');try{const href=await startScenario(selected,onboarding,existing);if(scopeRef.current===currentScope){setSelected(null);router.replace(href as never);}}catch(e){setError(e instanceof Error?e.message:'The scenario could not start. Please try again.');}finally{saving.current=false;setBusy(false);}};
 return <View style={styles.browser}>
  {!limit&&externalQuery===undefined?<TextInput accessibilityLabel="Search scenarios" placeholder="Search stories, people or places" placeholderTextColor={colors.dimmed} value={query} onChangeText={setQuery} style={styles.search}/>:null}
  <View style={styles.grid}>{choices.slice(0,limit??80).map(s=>{const session=sessions.find(p=>p.scenario_id===s.id);return <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`Scenario: ${s.title}. ${s.leadName}. ${s.locationName}`} onPress={()=>{setSelected(s);setError('');}} style={({pressed})=>[styles.card,pressed&&{opacity:.86}]}>
   <Image source={scenarioAssets[s.id]} contentFit="cover" cachePolicy="memory-disk" style={styles.image}/>
   <View style={styles.copy}><Text style={styles.themes} numberOfLines={1}>{s.themes.slice(0,2).join(' · ')}</Text><Text style={styles.title} numberOfLines={2}>{s.title}</Text><Text style={styles.lead}>{s.leadName}</Text><Text style={styles.setup} numberOfLines={2}>{s.setup}</Text><View style={styles.bottom}><Text style={styles.status}>{session?session.status==='active'?'In progress':session.status==='paused'?'Paused':'Completed':scenarioAvailable(s,snapshot)?s.locationName:'Discover this companion first'}</Text><ChevronRight size={16} color={colors.rose}/></View></View>
  </Pressable>;})}</View>
  {!choices.length?<Text style={styles.empty}>No scenarios match. Try another filter or search.</Text>:null}
  <CreatorModal visible={Boolean(selected)} title={selected?.title??'Scenario'} onClose={()=>{if(!busy)setSelected(null);}}>
   {selected?<><Image source={scenarioAssets[selected.id]} style={styles.preview} contentFit="cover"/><Text style={styles.themes}>{selected.themes.join(' · ')}</Text><Text style={styles.previewLead}>With {selected.leadName}</Text><View style={styles.place}><MapPin size={15} color={colors.muted}/><Text style={styles.lead}>{selected.locationName}</Text></View><Text style={styles.premise}>{selected.setup}</Text><Text style={styles.hint}>You choose what happens next.</Text>{!available?<Text style={styles.hint}>Discover {selected.leadName} through their world story before starting this scenario.</Text>:null}{error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}<Pressable accessibilityRole="button" accessibilityLabel={existing?'Continue scenario':'Start scenario'} disabled={busy||!available} onPress={()=>void start()} style={[styles.start,(busy||!available)&&{opacity:.5}]}>{busy?<ActivityIndicator color="#fff"/>:<BookOpen size={18} color="#fff"/>}<Text style={styles.startText}>{busy?'Opening your story…':existing?'Continue scenario':'Start scenario'}</Text></Pressable></>:null}
  </CreatorModal>
 </View>;
}
const styles=StyleSheet.create({browser:{gap:16},grid:{flexDirection:'row',flexWrap:'wrap',gap:16},card:{flexGrow:1,flexBasis:290,maxWidth:480,borderRadius:20,overflow:'hidden',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},image:{width:'100%',aspectRatio:1.5},copy:{padding:16,gap:8},themes:{fontSize:11,color:colors.rose,fontWeight:'800'},title:{fontSize:20,lineHeight:25,color:colors.text,fontWeight:'800'},lead:{fontSize:13,color:colors.muted},setup:{fontSize:13,lineHeight:19,color:colors.muted},bottom:{flexDirection:'row',alignItems:'center',gap:8,marginTop:4},status:{flex:1,fontSize:11,color:colors.muted},search:{minHeight:46,fontSize:16,paddingHorizontal:16,color:colors.text,backgroundColor:colors.surface,borderRadius:14,borderWidth:1,borderColor:colors.border},preview:{width:'100%',aspectRatio:1.5,borderRadius:16,marginBottom:16},previewLead:{fontSize:18,fontWeight:'700',color:colors.text,marginTop:12},place:{flexDirection:'row',gap:6,alignItems:'center',marginTop:8},premise:{fontSize:16,lineHeight:25,color:colors.text,marginTop:20},hint:{fontSize:13,lineHeight:20,color:colors.muted,marginTop:16},start:{marginTop:22,minHeight:50,borderRadius:15,backgroundColor:colors.rose,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:10},startText:{color:'#fff',fontWeight:'800',fontSize:15},empty:{paddingVertical:30,color:colors.muted},error:{color:colors.danger,marginTop:12}});
