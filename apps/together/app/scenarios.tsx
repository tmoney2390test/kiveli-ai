import {useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {ArrowLeft} from 'lucide-react-native';
import {Screen,LoadingSkeleton} from '../src/components';
import {ScenarioBrowser} from '../src/components/ScenarioBrowser';
import {CompanionWorldToggle} from '../src/components/CompanionWorldToggle';
import {CompanionGenderToggle} from '../src/components/CompanionGenderToggle';
import type {FeaturedGenderFilter} from '../src/lib/featuredCompanions';
import {useTogether} from '../src/store/useTogether';
import {colors} from '../src/theme';

export default function Scenarios(){
 const {world:slug}=useLocalSearchParams<{world?:string}>(),snapshot=useTogether(s=>s.snapshot);
 const [worldId,setWorldId]=useState(''),[gender,setGender]=useState<FeaturedGenderFilter>('any');
 if(!snapshot)return <LoadingSkeleton label="Loading scenarios…"/>;
 const worlds=snapshot.worlds.filter(w=>w.published).sort((a,b)=>a.sort_order-b.sort_order),world=worlds.find(w=>w.id===worldId)??worlds.find(w=>w.slug===slug)??worlds[0];
 if(!world)return null;
 return <Screen contentStyle={styles.screen}><View style={styles.heading}><Pressable accessibilityRole="button" accessibilityLabel="Back to Explore" onPress={()=>router.replace(`/explore?world=${world.slug}` as never)} style={styles.back}><ArrowLeft color={colors.text}/></Pressable><View style={{flex:1}}><Text accessibilityRole="header" style={styles.title}>Scenarios</Text><Text style={styles.subtitle}>A starting spark. A story you make your own.</Text></View></View><View style={styles.filters}><CompanionWorldToggle worlds={worlds} value={world.id} onChange={setWorldId}/><CompanionGenderToggle value={gender} onChange={setGender}/></View><ScenarioBrowser key={`${snapshot.activeContinuity?.id}:${world.id}`} worldId={world.id} gender={gender}/></Screen>;
}
const styles=StyleSheet.create({screen:{padding:20,paddingBottom:100,gap:24,maxWidth:1440,width:'100%',alignSelf:'center'},heading:{flexDirection:'row',alignItems:'center',gap:12},back:{width:44,height:44,alignItems:'center',justifyContent:'center'},title:{fontSize:30,fontWeight:'800',color:colors.text},subtitle:{fontSize:14,color:colors.muted,marginTop:6},filters:{flexDirection:'row',flexWrap:'wrap',gap:12}});
