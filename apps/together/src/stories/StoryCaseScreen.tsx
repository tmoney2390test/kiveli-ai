import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ArrowLeft, LockKeyhole, RotateCcw } from 'lucide-react-native';
import { loadStoryLibrary, startStoryCampaign } from '../lib/api';
import { createClientRequestId } from '../lib/requestId';
import { colors, spacing, typography } from '../theme';
import { storyConceptAssets } from './assets';
import { StoryPlayScreen } from './StoryPlayScreen';
import type { StoryCatalogItem } from './types';

export function StoryCaseScreen({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [story, setStory] = useState<StoryCatalogItem | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void loadStoryLibrary().then((data) => {
      if (active) setStory(data.stories.find((item) => item.slug === slug) ?? null);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : 'This case could not be opened.');
    });
    return () => { active = false; };
  }, [slug]);

  const begin = async () => {
    if (!story || story.status !== 'playable' || busy) return;
    if (story.campaign) {
      setActiveCampaignId(story.campaign.id);
      return;
    }
    setBusy(true);
    try {
      const { campaign } = await startStoryCampaign(story.slug, createClientRequestId());
      setActiveCampaignId(campaign.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The night could not begin.');
    } finally {
      setBusy(false);
    }
  };

  if (activeCampaignId) return <StoryPlayScreen campaignId={activeCampaignId} onCampaignReplaced={setActiveCampaignId} onExit={onBack} />;
  if (!story && !error) return <View style={styles.center}><ActivityIndicator color="#67D7C1" /></View>;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Stories" onPress={onBack} style={styles.back}><ArrowLeft color={colors.text} size={20}/><Text style={styles.backText}>Stories</Text></Pressable>
    {story ? <View style={styles.hero}>
      <Image source={story.status === 'playable' ? storyConceptAssets.library : storyConceptAssets.timeline} style={StyleSheet.absoluteFill} contentFit="cover"/>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.heroShade]}/>
      <View style={styles.copy}>
        <Text style={styles.world}>{worldName(story.worldSlug)}</Text><Text style={styles.title}>{story.title}</Text><Text style={styles.subtitle}>{story.genre}</Text><Text style={styles.description}>{story.description}</Text>
        <View style={styles.tags}><View style={styles.tag}><Text style={styles.tagText}>{story.genre}</Text></View></View>
        <Pressable accessibilityRole="button" accessibilityLabel={story.campaign ? 'Continue campaign' : 'Begin story'} disabled={story.status !== 'playable' || busy} onPress={() => void begin()} style={[styles.button, story.status !== 'playable' && styles.disabled]}>
          {story.status === 'playable' ? (story.campaign ? <RotateCcw size={18} color="#06100F"/> : null) : <LockKeyhole size={18} color="#99929E"/>}<Text style={[styles.buttonText, story.status !== 'playable' && styles.disabledText]}>{busy ? 'Opening…' : story.status !== 'playable' ? 'Coming soon' : story.campaign ? 'Continue campaign' : 'Begin story'}</Text>
        </Pressable>
      </View>
    </View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </ScrollView>;
}

function worldName(slug: string) { return slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '); }

const styles = StyleSheet.create({screen:{flex:1,backgroundColor:'#060810'},content:{width:'100%',maxWidth:1050,alignSelf:'center',padding:spacing.lg,paddingBottom:80,gap:20},center:{flex:1,backgroundColor:'#060810',alignItems:'center',justifyContent:'center'},back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:8,paddingVertical:8},backText:{color:colors.text,fontWeight:'800'},hero:{minHeight:640,borderRadius:28,overflow:'hidden',borderWidth:1,borderColor:'rgba(103,215,193,.25)'},heroShade:{backgroundColor:'rgba(5,7,12,.68)'},copy:{marginTop:'auto',padding:28,gap:9},world:{color:'#72D4C1',fontWeight:'900',letterSpacing:1.5,fontSize:11},title:{fontFamily:typography.display,color:colors.text,fontSize:45},subtitle:{color:'#E2D8E1',fontSize:18},description:{color:'#BDB7C1',fontSize:15,lineHeight:23,maxWidth:660},tags:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:6},tag:{borderRadius:999,borderWidth:1,borderColor:'rgba(255,255,255,.15)',backgroundColor:'rgba(6,8,13,.55)',paddingHorizontal:11,paddingVertical:6},tagText:{color:'#D4CCD5',fontSize:11,fontWeight:'700'},button:{alignSelf:'flex-start',minHeight:50,marginTop:8,borderRadius:15,backgroundColor:'#70D7C3',flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:20},buttonText:{color:'#06100F',fontWeight:'900',fontSize:15},disabled:{backgroundColor:'rgba(255,255,255,.08)'},disabledText:{color:'#A29CA6'},error:{color:'#FF9CAA'}});
