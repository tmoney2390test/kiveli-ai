import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { BookOpen, ChevronRight, X } from 'lucide-react-native';
import { loadStoryLibrary, startStoryCampaign } from '../lib/api';
import { createClientRequestId } from '../lib/requestId';
import { colors, typography } from '../theme';
import type { StoryCatalogItem, StoryLibrary } from './types';
import { storyArtwork } from './assets';

const GOLD='#B99152';
const IVORY='#F5E6C8';
const TEAL='#74D8CE';
const STORY_ACCENTS:Record<string,string>={
  'ghost-signal-neon-kyo':'#D85B92',
  'the-vanishing-at-port-vervelle':'#4FC8BE',
  'the-juniper-house':'#B66AD0',
};

export function StoryLibraryScreen({onClose}:{onClose?:()=>void}={}){
  const{width}=useWindowDimensions();
  const desktop=width>=900;
  const[data,setData]=useState<StoryLibrary|null>(null);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const load=useCallback(async()=>{setError('');try{setData(await loadStoryLibrary());}catch(caught){setError(caught instanceof Error?caught.message:'Stories could not be loaded.');}},[]);
  useEffect(()=>{void load();},[load]);

  const begin=async(story:StoryCatalogItem)=>{
    if(story.status!=='playable'||busy)return;
    if(story.campaign){router.push(`/story-play/${story.campaign.id}` as never);return;}
    setBusy(true);setError('');
    try{const{campaign}=await startStoryCampaign(story.slug,createClientRequestId());router.push(`/story-play/${campaign.id}` as never);}
    catch(caught){setError(caught instanceof Error?caught.message:'The night could not begin.');}
    finally{setBusy(false);}
  };

  if(!data&&!error)return <View style={styles.center}><ActivityIndicator color={TEAL} size="large"/><Text style={styles.muted}>Opening the archive…</Text></View>;

  const playable=data?.stories.find((story)=>story.status==='playable');
  const upcoming=data?.stories.filter((story)=>story.status!=='playable')??[];
  return <ScrollView style={styles.screen} contentContainerStyle={[styles.page,desktop&&styles.pageDesktop]} showsVerticalScrollIndicator={false}>
    <View style={styles.pageFrame}>
      <OrnateCorners color={GOLD} size={38}/>
      <View style={styles.header}>
        <View style={styles.headerSide}/>
        <View style={styles.brandWrap}><Text style={[styles.brand,desktop&&styles.brandDesktop]}>KIVELLI STORIES</Text><OrnamentRule color={GOLD}/></View>
        <View style={styles.headerSide}>{onClose?<Pressable accessibilityRole="button" accessibilityLabel="Close Stories" onPress={onClose} style={styles.seal}><X size={20} color={IVORY}/></Pressable>:<View style={styles.seal}><BookOpen size={21} color={IVORY}/></View>}</View>
      </View>

      {error?<Pressable onPress={()=>void load()} style={styles.error}><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Tap to retry</Text></Pressable>:null}

      {playable?<Pressable accessibilityRole="button" accessibilityLabel={`${playable.campaign?'Continue':'Begin'} ${playable.title}`} disabled={busy} onPress={()=>void begin(playable)} style={({pressed})=>[styles.hero,desktop&&styles.heroDesktop,pressed&&styles.pressed]}>
        <Image source={storyArtwork[playable.slug as keyof typeof storyArtwork]??storyArtwork['the-last-night-in-vespormoor']} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" cachePolicy="memory-disk"/>
        <OrnateCorners color={GOLD} size={32}/>
        <View style={[styles.heroCopy,desktop&&styles.heroCopyDesktop]}>
          <Text style={styles.continueKicker}>{playable.campaign?'—  CONTINUE PLAYING  —':'—  BEGIN THE STORY  —'}</Text>
          <Text style={[styles.heroTitle,desktop&&styles.heroTitleDesktop]}>{playable.title.toUpperCase()}</Text>
          <View style={styles.storyMeta}><Text style={styles.storyMetaText}>{playable.campaign?`Loop ${playable.campaign.loop+1}`:playable.genre}</Text>{playable.campaign?<><Text style={styles.metaDot}>◆</Text><Text style={[styles.storyMetaText,{color:TEAL}]}>{playable.campaign.factsDiscovered} / {playable.campaign.factsTotal??40} Facts</Text></>:null}</View>
          <View style={[styles.continueButton,desktop&&styles.continueButtonDesktop]}><OrnateCorners color="#C9A66B" size={14}/>{busy?<ActivityIndicator color={IVORY}/>:<><Text style={styles.continueText}>{playable.campaign?'CONTINUE':'BEGIN STORY'}</Text><ChevronRight size={22} color={IVORY}/></>}</View>
        </View>
      </Pressable>:null}

      <View style={styles.sectionHeader}><OrnamentRule color={GOLD}/><Text style={styles.sectionTitle}>COMING SOON</Text><OrnamentRule color={GOLD}/></View>
      <View style={styles.storyList}>{upcoming.map((story)=><ComingSoonCard key={story.slug} story={story} desktop={desktop}/>)}</View>
    </View>
  </ScrollView>;
}

function ComingSoonCard({story,desktop}:{story:StoryCatalogItem;desktop:boolean}){
  const accent=STORY_ACCENTS[story.slug]??TEAL;
  const source=storyArtwork[story.slug as keyof typeof storyArtwork]??storyArtwork['the-last-night-in-vespormoor'];
  return <View style={[styles.card,desktop&&styles.cardDesktop,{borderColor:`${accent}99`}] }>
    <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" cachePolicy="memory-disk"/>
    <OrnateCorners color={accent} size={26}/>
    <View style={[styles.cardCopy,desktop&&styles.cardCopyDesktop]}>
      <Text style={[styles.cardTitle,desktop&&styles.cardTitleDesktop]}>{story.title.toUpperCase()}</Text>
      <View style={[styles.miniRule,{backgroundColor:accent}]}/>
      <Text style={[styles.cardGenre,{color:accent}]}>{story.genre.toUpperCase()}</Text>
    </View>
  </View>;
}

function OrnamentRule({color}:{color:string}){return <View style={styles.ruleWrap}><View style={[styles.rule,{backgroundColor:color}]}/><Text style={[styles.diamond,{color}]}>◇</Text><View style={[styles.rule,{backgroundColor:color}]}/></View>;}
function OrnateCorners({color,size}:{color:string;size:number}){return <View pointerEvents="none" style={StyleSheet.absoluteFill}><Corner color={color} size={size} style={styles.cornerTL}/><Corner color={color} size={size} style={styles.cornerTR}/><Corner color={color} size={size} style={styles.cornerBL}/><Corner color={color} size={size} style={styles.cornerBR}/></View>;}
function Corner({color,size,style}:{color:string;size:number;style:object}){return <View style={[styles.corner,style,{width:size,height:size,borderColor:color}]}/>;}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#02070B'},page:{width:'100%',maxWidth:1220,alignSelf:'center',padding:8,paddingBottom:52},pageDesktop:{padding:18,paddingBottom:64},pageFrame:{position:'relative',borderWidth:1,borderColor:'rgba(185,145,82,.72)',backgroundColor:'#030A0F',padding:12,paddingTop:20,gap:22,overflow:'hidden'},
  center:{flex:1,backgroundColor:'#02070B',alignItems:'center',justifyContent:'center',gap:14},muted:{color:'#AFA69B',fontSize:13},
  header:{minHeight:105,flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',paddingHorizontal:4},headerSide:{width:54,alignItems:'flex-end'},brandWrap:{flex:1,maxWidth:620,alignItems:'center',gap:12},brand:{fontFamily:typography.display,color:IVORY,fontSize:22,letterSpacing:6,textAlign:'center',textShadowColor:'rgba(226,188,111,.22)',textShadowRadius:9},brandDesktop:{fontSize:34,letterSpacing:11},seal:{width:48,height:48,borderRadius:24,borderWidth:1,borderColor:'rgba(196,158,93,.72)',backgroundColor:'rgba(2,8,12,.72)',alignItems:'center',justifyContent:'center'},
  ruleWrap:{flex:1,width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},rule:{height:1,flex:1,maxWidth:165,opacity:.7},diamond:{fontSize:18,lineHeight:19},
  hero:{position:'relative',minHeight:470,overflow:'hidden',borderWidth:1,borderColor:'rgba(185,145,82,.82)',backgroundColor:'#071117'},heroDesktop:{minHeight:580},heroCopy:{marginTop:'auto',paddingHorizontal:27,paddingVertical:32,gap:12,maxWidth:640},heroCopyDesktop:{paddingHorizontal:52,paddingVertical:48},continueKicker:{fontFamily:typography.display,color:TEAL,fontSize:13,letterSpacing:2,textShadowColor:'rgba(0,0,0,.95)',textShadowRadius:9},heroTitle:{fontFamily:typography.display,color:IVORY,fontSize:36,lineHeight:43,letterSpacing:1.3,textShadowColor:'rgba(0,0,0,.95)',textShadowRadius:12},heroTitleDesktop:{fontSize:56,lineHeight:65,maxWidth:620},storyMeta:{flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'},storyMetaText:{fontFamily:typography.display,color:'#E6D1AA',fontSize:16,letterSpacing:1,textShadowColor:'rgba(0,0,0,.95)',textShadowRadius:8},metaDot:{color:GOLD,fontSize:8},continueButton:{position:'relative',alignSelf:'flex-start',minWidth:238,minHeight:64,marginTop:10,borderWidth:1,borderColor:'#C5A264',backgroundColor:'rgba(2,57,60,.83)',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:11,paddingHorizontal:24},continueButtonDesktop:{minWidth:310,minHeight:76},continueText:{fontFamily:typography.display,color:IVORY,fontSize:22,letterSpacing:3},
  sectionHeader:{flexDirection:'row',alignItems:'center',gap:15,paddingHorizontal:8},sectionTitle:{fontFamily:typography.display,color:IVORY,fontSize:20,letterSpacing:5,textAlign:'center'},storyList:{gap:20},card:{position:'relative',height:250,overflow:'hidden',borderWidth:1,backgroundColor:'#071015'},cardDesktop:{height:300},cardCopy:{marginTop:'auto',paddingHorizontal:27,paddingVertical:28,gap:10,maxWidth:'82%'},cardCopyDesktop:{paddingHorizontal:44,paddingVertical:38,maxWidth:'62%'},cardTitle:{fontFamily:typography.display,color:IVORY,fontSize:28,lineHeight:34,letterSpacing:1,textShadowColor:'rgba(0,0,0,.98)',textShadowRadius:12},cardTitleDesktop:{fontSize:40,lineHeight:47},miniRule:{width:78,height:1,opacity:.8},cardGenre:{fontFamily:typography.display,fontSize:13,letterSpacing:2.6,textShadowColor:'rgba(0,0,0,.98)',textShadowRadius:8},
  corner:{position:'absolute',borderWidth:0},cornerTL:{top:8,left:8,borderTopWidth:1,borderLeftWidth:1},cornerTR:{top:8,right:8,borderTopWidth:1,borderRightWidth:1},cornerBL:{bottom:8,left:8,borderBottomWidth:1,borderLeftWidth:1},cornerBR:{bottom:8,right:8,borderBottomWidth:1,borderRightWidth:1},
  error:{backgroundColor:'rgba(255,113,129,.09)',borderWidth:1,borderColor:'rgba(255,113,129,.25)',padding:14},errorText:{color:'#FFB2BC',fontSize:13},retry:{color:colors.text,fontSize:12,fontWeight:'800',marginTop:5},pressed:{opacity:.92,transform:[{scale:.997}]},
});
