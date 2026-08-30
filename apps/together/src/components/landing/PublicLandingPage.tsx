import { createElement, useEffect, useRef, useState } from 'react';
import {
  InteractionManager,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  Globe2,
  Heart,
  ImageIcon,
  MapPin,
  MessageCircle,
  Sparkles,
  Users,
} from 'lucide-react-native';
import { KivelleLogo } from '../KivelleLogo';
import { radius, typography } from '../../theme';
import { joinPathFor } from '../../lib/sessionRouting';
import { PUBLIC_COMPANIONS, PUBLIC_LANDING_COPY, PUBLIC_WORLDS, type PublicCompanion, type PublicWorld } from '../../lib/publicLanding';
import { publicCompanionAssets, publicLandingHeroPortraitAsset, publicLandingHeroUrls, publicLandingMobileHeroAsset, publicWorldAssets } from './publicLandingAssets';

type LandingSection = 'worlds' | 'why' | 'companions';

const featureStrip = [
  { title: 'Living worlds', body: 'Places, routines, and stories that keep moving.', icon: <Globe2 size={25} color="#DDA2FF" /> },
  { title: 'Companions with roots', body: 'Every person has a life beyond the chat.', icon: <Users size={25} color="#DDA2FF" /> },
  { title: 'Real conversations', body: 'Context-aware connection that remembers.', icon: <MessageCircle size={25} color="#DDA2FF" /> },
  { title: 'Moments & photos', body: 'Shared memories made inside the story.', icon: <ImageIcon size={25} color="#DDA2FF" /> },
] as const;

const whyFeatures = [
  { title: 'Dynamic locations', body: 'New places, changing schedules, and world-specific moments give every connection somewhere to happen.', icon: <MapPin size={25} color="#E7A8FF" /> },
  { title: 'Companions with roots', body: 'Every companion has work, relationships, routines, favorite places, and a home of their own.', icon: <Users size={25} color="#E7A8FF" /> },
  { title: 'Stories that evolve', body: 'What you say becomes shared history, shaping future conversations and the moments you unlock.', icon: <BookOpen size={25} color="#E7A8FF" /> },
  { title: 'Events & moments', body: 'Calendars, changing activities, and photo-worthy scenes create reasons to return and reconnect.', icon: <CalendarDays size={25} color="#E7A8FF" /> },
] as const;

const factualHighlights = [
  { value: '4', label: 'Living worlds', icon: <Globe2 size={31} color="#D584EF" /> },
  { value: 'Every day', label: 'Lives keep moving', icon: <Clock3 size={31} color="#D584EF" /> },
  { value: 'Your story', label: 'Shared history grows', icon: <MessageCircle size={31} color="#D584EF" /> },
  { value: '18+', label: 'Fictional AI companions', icon: <Heart size={31} color="#EE87BE" /> },
] as const;

export function PublicLandingPage() {
  const { width } = useWindowDimensions();
  const desktop = width >= 980;
  const tablet = width >= 680;
  const scroll = useRef<ScrollView | null>(null);
  const sectionY = useRef<Partial<Record<LandingSection, number>>>({});
  const [sectionsReady,setSectionsReady]=useState(false);
  const juniperPath = '/singles?world=juniper-city';

  useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;const task=InteractionManager.runAfterInteractions(()=>{timer=setTimeout(()=>setSectionsReady(true),800);});return()=>{task.cancel();if(timer)clearTimeout(timer);};},[]);

  const recordSection = (section: LandingSection) => (event: LayoutChangeEvent) => {
    sectionY.current[section] = event.nativeEvent.layout.y;
  };
  const scrollToSection = (section: LandingSection) => {
    const y = sectionY.current[section];
    if (typeof y === 'number') {
      scroll.current?.scrollTo({ y: Math.max(0, y - 76), animated: true });
      return;
    }
    setSectionsReady(true);
    setTimeout(()=>{const deferredY=sectionY.current[section];if(typeof deferredY==='number')scroll.current?.scrollTo({y:Math.max(0,deferredY-76),animated:true});},32);
  };
  const join = (next?: string) => router.push(joinPathFor(next) as never);
  const signIn = () => router.push('/auth?mode=signin');

  return <View style={styles.page}>
    <View pointerEvents="none" style={styles.ambientTop} />
    <View pointerEvents="none" style={styles.ambientMiddle} />
    <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.scrollContent} stickyHeaderIndices={[0]} showsVerticalScrollIndicator={false}>
      <LandingHeader
        compact={!tablet}
        onSignIn={signIn}
        onStart={() => join(juniperPath)}
        onWorlds={() => scrollToSection('worlds')}
        onWhy={() => scrollToSection('why')}
        onCompanions={() => scrollToSection('companions')}
      />

      <View style={styles.main}>
        <Hero
          desktop={desktop}
          compact={!tablet}
          onEnter={() => join(juniperPath)}
          onMeet={() => scrollToSection('companions')}
        />

        <View style={[styles.featureStrip, !desktop && styles.featureStripWrap, !tablet && styles.featureStripCompact]}>
          {featureStrip.map((feature) => <View key={feature.title} style={[styles.stripItem, desktop ? styles.stripItemDesktop : styles.stripItemWrapped, !tablet && styles.stripItemCompact]}>
            <View style={styles.stripIcon}>{feature.icon}</View>
            <View style={styles.stripCopy}>
              <Text style={styles.stripTitle}>{feature.title}</Text>
              <Text style={styles.stripBody}>{feature.body}</Text>
            </View>
          </View>)}
        </View>

        {sectionsReady?<><View onLayout={recordSection('worlds')} style={styles.section}>
          <SectionHeading compact={!tablet} title="Featured Worlds" action="Meet every world" onAction={() => join('/explore')} />
          <View style={styles.worldGrid}>
            {PUBLIC_WORLDS.map((world) => <WorldCard key={world.slug} world={world} desktop={desktop} tablet={tablet} onPress={() => join(`/singles?world=${world.slug}`)} />)}
          </View>
        </View>

        <View onLayout={recordSection('why')} style={styles.section}>
          <SectionHeading compact={!tablet} title="Why It Feels Alive" subtitle="Connection has more meaning when it has a world around it." />
          <View style={styles.whyGrid}>
            {whyFeatures.map((feature) => <View key={feature.title} style={[styles.whyCard, desktop ? styles.whyCardDesktop : tablet ? styles.whyCardTablet : styles.whyCardCompact]}>
              <View style={styles.whyIcon}>{feature.icon}</View>
              <Text style={styles.whyTitle}>{feature.title}</Text>
              <Text style={styles.whyBody}>{feature.body}</Text>
            </View>)}
          </View>
        </View>

        <View onLayout={recordSection('companions')} style={styles.section}>
          <SectionHeading compact={!tablet} title="Featured Companions" subtitle="Real personalities with lives in Juniper City, Port Vervelle, and Neon Kyo." action="Meet all companions" onAction={() => join(juniperPath)} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.companionRail}>
            {PUBLIC_COMPANIONS.map((companion) => <CompanionCard key={companion.slug} companion={companion} compact={!tablet} onPress={() => join(`/character/${companion.slug}`)} />)}
          </ScrollView>
        </View>

        <View style={[styles.highlights, !desktop && styles.highlightsWrap]}>
          {factualHighlights.map((highlight) => <View key={highlight.label} style={[styles.highlight, desktop ? styles.highlightDesktop : styles.highlightWrapped]}>
            {highlight.icon}
            <View>
              <Text style={styles.highlightValue}>{highlight.value}</Text>
              <Text style={styles.highlightLabel}>{highlight.label}</Text>
            </View>
          </View>)}
        </View>

        <View style={[styles.finalCta, !tablet && styles.finalCtaCompact]}>
          <View pointerEvents="none" style={styles.finalGlow} />
          <View style={styles.finalCopy}>
            <Text style={styles.finalEyebrow}>YOUR NEXT STORY IS WAITING</Text>
            <Text style={[styles.finalTitle, !tablet && styles.finalTitleCompact]}>Find someone—and somewhere—you want to return to.</Text>
            <Text style={styles.finalBody}>Choose a world, meet someone who belongs there, and let the connection become part of both your lives.</Text>
          </View>
          <LandingButton label="Start Exploring" onPress={() => join(juniperPath)} />
        </View>

        <LandingFooter onSignIn={signIn} onWorlds={() => scrollToSection('worlds')} onCompanions={() => scrollToSection('companions')} /></>:<LandingSectionsLoading/>}
      </View>
    </ScrollView>
  </View>;
}

function LandingSectionsLoading(){return <View accessibilityLabel="Loading more Kivelle worlds" style={styles.deferredSections}><View style={styles.deferredHeading}/><View style={styles.deferredGrid}>{[0,1,2].map((item)=><View key={item} style={styles.deferredCard}/>)}</View></View>;}

function LandingHeader({ compact, onSignIn, onStart, onWorlds, onWhy, onCompanions }: {
  compact: boolean;
  onSignIn: () => void;
  onStart: () => void;
  onWorlds: () => void;
  onWhy: () => void;
  onCompanions: () => void;
}) {
  return <View style={[styles.header, Platform.OS === 'web' && styles.headerWeb]}>
    <View style={[styles.headerInner, compact && styles.headerInnerCompact]}>
      <KivelleLogo height={compact ? 29 : 35} />
      {!compact ? <View accessibilityLabel="Landing page navigation" style={styles.nav}>
        <HeaderLink label="Worlds" onPress={onWorlds} />
        <HeaderLink label="Companions" onPress={onCompanions} />
        <HeaderLink label="Why Kivelle" onPress={onWhy} />
      </View> : null}
      <View style={styles.headerActions}>
        <Pressable accessibilityRole="button" onPress={onSignIn} style={({ pressed }) => [styles.loginButton, compact && styles.loginButtonCompact, pressed && styles.pressed]}>
          <Text style={styles.loginText}>Log in</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onStart} style={({ pressed }) => [styles.startButton, compact && styles.startButtonCompact, pressed && styles.pressed]}>
          <Text style={styles.startText}>{compact ? 'Explore' : 'Start Exploring'}</Text>
        </Pressable>
      </View>
    </View>
  </View>;
}

function HeaderLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.navLink, pressed && styles.pressed]}>
    <Text style={styles.navText}>{label}</Text>
  </Pressable>;
}

function Hero({ desktop, compact, onEnter, onMeet }: { desktop: boolean; compact: boolean; onEnter: () => void; onMeet: () => void }) {
  const heroPortrait = publicLandingHeroPortraitAsset;
  const [visualReady,setVisualReady]=useState(false);
  useEffect(()=>{if(Platform.OS==='web')setVisualReady(true);},[]);
  return <View style={[styles.hero, desktop ? styles.heroDesktop : styles.heroStacked, compact && styles.heroCompact]}>
    {Platform.OS==='web'
      ? <WebLandingHeroBackground onLoad={()=>setVisualReady(true)}/>
      : <Image accessible accessibilityLabel="Juniper City skyline at dusk" source={compact ? publicLandingMobileHeroAsset : publicWorldAssets['juniper-city']} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" loading="eager" priority="high" onLoad={()=>setVisualReady(true)} />}
    <View style={[styles.heroPortraitFrame, desktop ? styles.heroPortraitDesktop : styles.heroPortraitStacked, compact && styles.heroPortraitCompact]}>
      {Platform.OS==='web'
        ? createElement('img',{src:publicLandingHeroUrls.portrait,alt:'Becka Shaw in Juniper City',loading:'lazy',fetchPriority:'low',style:webHeroPortraitStyle})
        : <Image accessible accessibilityLabel="Becka Shaw in Juniper City" source={heroPortrait} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" loading="eager" priority="high" />}
    </View>
    <View pointerEvents="none" style={styles.heroBaseShade} />
    <View pointerEvents="none" style={[
      styles.heroReadability,
      desktop ? styles.heroReadabilityDesktop : styles.heroReadabilityStacked,
      Platform.OS === 'web' && (desktop ? styles.heroReadabilityDesktopWeb : styles.heroReadabilityStackedWeb),
    ]} />
    <View style={[styles.heroContent, desktop ? styles.heroContentDesktop : styles.heroContentStacked, compact && styles.heroContentCompact]}>
      <View style={styles.heroBadge}>
        <Sparkles size={13} color="#E8A8FF" />
        <Text style={styles.heroBadgeText}>{PUBLIC_LANDING_COPY.badge}</Text>
      </View>
      <Text accessibilityRole="header" style={[styles.heroTitle, !desktop && styles.heroTitleStacked, compact && styles.heroTitleCompact]}>{PUBLIC_LANDING_COPY.title}</Text>
      <Text accessibilityRole="header" style={[styles.heroTitle, styles.heroTitleAccent, !desktop && styles.heroTitleStacked, compact && styles.heroTitleCompact]}>{PUBLIC_LANDING_COPY.titleAccent}</Text>
      <Text style={[styles.heroBody, compact && styles.heroBodyCompact]}>{PUBLIC_LANDING_COPY.body}</Text>
      <View style={[styles.heroButtons, compact && styles.heroButtonsCompact]}>
        <LandingButton label="Enter Juniper City" onPress={onEnter} compact={compact} />
        <LandingButton label="Meet Companions" onPress={onMeet} secondary compact={compact} />
      </View>
      <SocialProof compact={compact} visualReady={visualReady} />
    </View>
    {desktop ? <>
      <View style={styles.chatCard}>
        <View style={styles.chatHeader}>
          <Image source={publicCompanionAssets['becka-shaw']} style={styles.chatAvatar} contentFit="cover" contentPosition="top" />
          <View style={styles.chatNameWrap}><Text style={styles.chatName}>Becka</Text><Text style={styles.chatMeta}>Riverwalk · Juniper City</Text></View>
          <Text style={styles.chatTime}>just now</Text>
        </View>
        <Text style={styles.chatMessage}>Found a rooftop with the best sunset. You in? 🌆</Text>
      </View>
      <View style={styles.worldPreview}>
        <Image source={publicWorldAssets['juniper-city']} style={styles.worldPreviewImage} contentFit="cover" />
        <View style={styles.worldPreviewCopy}>
          <Text style={styles.worldPreviewTitle}>Juniper City</Text>
          <Text style={styles.worldPreviewMeta}>A living world</Text>
          <Text style={styles.worldPreviewBody}>People, places, and stories moving around you.</Text>
        </View>
        <ChevronRight size={20} color="#F7EAF7" />
      </View>
    </> : null}
  </View>;
}

const webHeroPictureStyle={position:'absolute',inset:0,display:'block',width:'100%',height:'100%'} as const;
const webHeroImageStyle={display:'block',width:'100%',height:'100%',objectFit:'cover',objectPosition:'center'} as const;
const webHeroPortraitStyle={position:'absolute',inset:0,display:'block',width:'100%',height:'100%',objectFit:'cover',objectPosition:'top center'} as const;
function WebLandingHeroBackground({onLoad}:{onLoad:()=>void}){return createElement('picture',{style:webHeroPictureStyle},createElement('source',{media:'(max-width: 679px)',srcSet:publicLandingHeroUrls.mobile}),createElement('img',{src:publicLandingHeroUrls.desktop,alt:'Juniper City skyline at dusk',loading:'eager',fetchPriority:'high',style:webHeroImageStyle,onLoad}));}

function SocialProof({ compact,visualReady }: { compact: boolean;visualReady:boolean }) {
  const portraits = PUBLIC_COMPANIONS.slice(0, compact ? 3 : 5);
  return <View style={[styles.socialProof, compact && styles.socialProofCompact]}>
    <View style={styles.avatarStack}>
      {portraits.map((companion, index) => <View key={companion.slug} style={[styles.proofAvatarFrame, index > 0 && styles.proofAvatarOverlap]}>
        {visualReady?<Image source={publicCompanionAssets[companion.slug]} style={styles.proofAvatar} contentFit="cover" contentPosition="top" loading="lazy" priority="low"/>:<View style={styles.proofAvatarPlaceholder}/>}
      </View>)}
    </View>
    <View>
      <Text style={styles.proofStars}>★★★★★</Text>
      <Text style={styles.proofText}>Four worlds. Countless ways to connect.</Text>
    </View>
  </View>;
}

function LandingButton({ label, onPress, secondary = false, compact = false }: { label: string; onPress: () => void; secondary?: boolean; compact?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.ctaButton, secondary && styles.ctaButtonSecondary, compact && styles.ctaButtonCompact, pressed && styles.ctaPressed]}>
    <Text style={[styles.ctaText, secondary && styles.ctaTextSecondary]}>{label}</Text>
    <ChevronRight size={19} color="#FFF" />
  </Pressable>;
}

function SectionHeading({ title, subtitle, action, onAction, compact = false }: { title: string; subtitle?: string; action?: string; onAction?: () => void; compact?: boolean }) {
  return <View style={[styles.sectionHeading, compact && styles.sectionHeadingCompact]}>
    <View style={styles.sectionHeadingCopy}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
    {action && onAction ? <Pressable accessibilityRole="link" onPress={onAction} style={({ pressed }) => [styles.sectionAction, compact && styles.sectionActionCompact, pressed && styles.pressed]}>
      <Text style={styles.sectionActionText}>{action}</Text><ChevronRight size={17} color="#E269E5" />
    </Pressable> : null}
  </View>;
}

function WorldCard({ world, desktop, tablet, onPress }: { world: PublicWorld; desktop: boolean; tablet: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="link" accessibilityLabel={`Explore ${world.name}`} onPress={onPress} style={({ pressed }) => [styles.worldCard, desktop ? styles.worldCardDesktop : tablet ? styles.worldCardTablet : styles.worldCardCompact, pressed && styles.cardPressed]}>
    <Image source={publicWorldAssets[world.slug]} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={`${world.name} world artwork`} loading="lazy" priority="low" />
    <View style={styles.worldShade} />
    <View style={styles.worldCardTop}>
      <Text style={styles.worldEyebrow}>{world.eyebrow}</Text>
      {world.new ? <View style={styles.newPill}><Sparkles size={10} color="#F5D1FF" /><Text style={styles.newText}>NEW</Text></View> : null}
    </View>
    <View style={styles.worldCardBottom}>
      <View style={styles.worldCardCopy}>
        <Text style={styles.worldName}>{world.name}</Text>
        <Text style={styles.worldDescription}>{world.description}</Text>
      </View>
      <View style={styles.worldArrow}><ChevronRight size={20} color="#FFF" /></View>
    </View>
  </Pressable>;
}

function CompanionCard({ companion, compact, onPress }: { companion: PublicCompanion; compact: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="link" accessibilityLabel={`Meet ${companion.name} from ${companion.worldName}`} onPress={onPress} style={({ pressed }) => [styles.companionCard, compact && styles.companionCardCompact, pressed && styles.cardPressed]}>
    <Image source={publicCompanionAssets[companion.slug]} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" accessibilityLabel={`${companion.name} portrait`} loading="lazy" priority="low" />
    <View style={styles.companionShade} />
    <View style={styles.companionWorldPill}><Text style={styles.companionWorldText}>{companion.worldName}</Text></View>
    <View style={styles.companionContent}>
      <Text style={styles.companionName}>{companion.name}</Text>
      <View style={styles.companionLocation}><MapPin size={12} color="#9EE4C0" /><Text style={styles.companionLocationText}>{companion.location} · {companion.worldName}</Text></View>
      <Text style={styles.companionDescription} numberOfLines={2}>{companion.description}</Text>
      <View style={styles.tags}>{companion.tags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}</View>
    </View>
  </Pressable>;
}

function LandingFooter({ onSignIn, onWorlds, onCompanions }: { onSignIn: () => void; onWorlds: () => void; onCompanions: () => void }) {
  return <View style={styles.footer}>
    <View style={styles.footerBrand}>
      <KivelleLogo height={30} />
      <Text style={styles.footerText}>Fictional AI companions in living worlds. For adults 18 and older.</Text>
    </View>
    <View style={styles.footerLinks}>
      <FooterLink label="Worlds" onPress={onWorlds} />
      <FooterLink label="Companions" onPress={onCompanions} />
      <FooterLink label="Terms" onPress={() => router.push('/terms' as never)} />
      <FooterLink label="Privacy" onPress={() => router.push('/privacy-policy' as never)} />
      <FooterLink label="Safety" onPress={() => router.push('/community-guidelines' as never)} />
      <FooterLink label="Help" onPress={() => router.push('/help' as never)} />
      <FooterLink label="Log in" onPress={onSignIn} />
    </View>
    <Text style={styles.copyright}>© 2026 Kivelle.AI</Text>
  </View>;
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}><Text style={styles.footerLink}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#05040A' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 0 },
  ambientTop: { position: 'absolute', zIndex: 0, top: -260, right: -140, width: 680, height: 680, borderRadius: 340, backgroundColor: 'rgba(108,30,139,.13)' },
  ambientMiddle: { position: 'absolute', zIndex: 0, top: 980, left: -240, width: 720, height: 720, borderRadius: 360, backgroundColor: 'rgba(76,39,150,.08)' },
  header: { zIndex: 100, width: '100%', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.07)', backgroundColor: 'rgba(5,4,10,.91)' },
  headerWeb: { backdropFilter: 'blur(22px)' } as never,
  headerInner: { width: '100%', maxWidth: 1320, minHeight: 78, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, gap: 24 },
  headerInnerCompact: { minHeight: 68, paddingHorizontal: 16, gap: 10 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  navLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 17, borderRadius: radius.pill },
  navText: { color: '#EDE5EF', fontSize: 13, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loginButton: { minHeight: 44, minWidth: 88, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,.20)', backgroundColor: 'rgba(8,7,13,.55)' },
  loginButtonCompact: { minWidth: 64, minHeight: 40, paddingHorizontal: 11 },
  loginText: { color: '#FFF7FC', fontSize: 13, fontWeight: '800' },
  startButton: { minHeight: 46, minWidth: 144, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 21, borderRadius: radius.pill, backgroundColor: '#B20AC6', shadowColor: '#D11DE3', shadowOpacity: .42, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 7 },
  startButtonCompact: { minWidth: 75, minHeight: 40, paddingHorizontal: 13 },
  startText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  main: { width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 28, paddingBottom: 24 },
  hero: { position: 'relative', overflow: 'hidden', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, borderWidth: 1, borderTopWidth: 0, borderColor: 'rgba(222,125,255,.15)', backgroundColor: '#08070E' },
  heroDesktop: { minHeight: 676 },
  heroStacked: { minHeight: 760 },
  heroCompact: { minHeight: 800, marginHorizontal: -28, borderRadius: 0, borderLeftWidth: 0, borderRightWidth: 0 },
  heroPortraitFrame: { position: 'absolute', overflow: 'hidden', backgroundColor: '#17131E' },
  heroPortraitDesktop: { top: 0, right: 0, bottom: 0, width: '57%' },
  heroPortraitStacked: { left: '42%', right: 0, top: 0, bottom: 0 },
  heroPortraitCompact: { left: 0, right: 0, top: '51%', bottom: 0 },
  heroBaseShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(4,3,9,.24)' },
  heroReadability: { ...StyleSheet.absoluteFill },
  heroReadabilityDesktop: { backgroundColor: 'rgba(4,3,9,.44)' },
  heroReadabilityStacked: { backgroundColor: 'rgba(4,3,9,.56)' },
  heroReadabilityDesktopWeb: { backgroundColor: 'transparent', backgroundImage: 'linear-gradient(90deg, rgba(4,3,9,.99) 0%, rgba(4,3,9,.95) 35%, rgba(4,3,9,.43) 61%, rgba(4,3,9,.08) 100%)' } as never,
  heroReadabilityStackedWeb: { backgroundColor: 'transparent', backgroundImage: 'linear-gradient(180deg, rgba(4,3,9,.98) 0%, rgba(4,3,9,.88) 49%, rgba(4,3,9,.24) 76%, rgba(4,3,9,.56) 100%)' } as never,
  heroContent: { position: 'relative', zIndex: 3 },
  heroContentDesktop: { width: '51%', paddingLeft: 44, paddingRight: 30, paddingTop: 76, paddingBottom: 62 },
  heroContentStacked: { width: '67%', paddingLeft: 34, paddingRight: 26, paddingTop: 64, paddingBottom: 55 },
  heroContentCompact: { width: '100%', paddingHorizontal: 24, paddingTop: 48, paddingBottom: 390 },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(206,104,237,.46)', backgroundColor: 'rgba(85,21,100,.18)' },
  heroBadgeText: { color: '#DDB6F4', fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1.15 },
  heroTitle: { color: '#FFF8F4', fontFamily: typography.display, fontSize: 61, lineHeight: 65, fontWeight: '700', letterSpacing: -1.7, textShadowColor: '#000', textShadowRadius: 18, marginTop: 28 },
  heroTitleAccent: { color: '#B8A0F2', marginTop: 0 },
  heroTitleStacked: { fontSize: 51, lineHeight: 55 },
  heroTitleCompact: { fontSize: 39, lineHeight: 43, letterSpacing: -.9, marginTop: 24 },
  heroBody: { maxWidth: 510, color: '#CFC5D1', fontSize: 15, lineHeight: 24, marginTop: 23 },
  heroBodyCompact: { fontSize: 14, lineHeight: 22, marginTop: 18 },
  heroButtons: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 27 },
  heroButtonsCompact: { alignItems: 'stretch', flexDirection: 'column', marginTop: 22 },
  ctaButton: { minHeight: 53, minWidth: 196, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: '#B209C5', borderWidth: 1, borderColor: 'rgba(255,139,255,.46)', shadowColor: '#CD24DB', shadowOpacity: .38, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 7 },
  ctaButtonSecondary: { minWidth: 180, backgroundColor: 'rgba(8,7,14,.48)', borderColor: 'rgba(255,255,255,.28)', shadowOpacity: 0 },
  ctaButtonCompact: { width: '100%', minHeight: 50 },
  ctaPressed: { opacity: .86, transform: [{ scale: .985 }] },
  ctaText: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  ctaTextSecondary: { color: '#F7F0F8' },
  socialProof: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 25 },
  socialProofCompact: { gap: 11, marginTop: 20 },
  avatarStack: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  proofAvatarFrame: { width: 38, height: 38, padding: 2, borderRadius: 20, backgroundColor: '#EEE0EC' },
  proofAvatarOverlap: { marginLeft: -11 },
  proofAvatar: { width: 34, height: 34, borderRadius: 17 },
  proofAvatarPlaceholder: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#D3C2D1' },
  proofStars: { color: '#FFBE2E', fontSize: 15, lineHeight: 18, letterSpacing: 1.5 },
  proofText: { color: '#C7BDCA', fontSize: 11, marginTop: 3 },
  chatCard: { position: 'absolute', zIndex: 6, top: 290, right: 31, width: 288, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(222,105,238,.48)', backgroundColor: 'rgba(20,15,29,.90)', shadowColor: '#000', shadowOpacity: .5, shadowRadius: 24, shadowOffset: { width: 0, height: 11 }, elevation: 10 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatAvatar: { width: 40, height: 40, borderRadius: 20 },
  chatNameWrap: { flex: 1 },
  chatName: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  chatMeta: { color: '#BEB1C4', fontSize: 9, marginTop: 2 },
  chatTime: { color: '#918597', fontSize: 8 },
  chatMessage: { color: '#F1E8F1', fontSize: 12, lineHeight: 18, marginTop: 12 },
  worldPreview: { position: 'absolute', zIndex: 6, right: 31, bottom: 31, width: 309, minHeight: 93, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,.19)', backgroundColor: 'rgba(17,13,24,.91)', shadowColor: '#000', shadowOpacity: .48, shadowRadius: 24, shadowOffset: { width: 0, height: 11 }, elevation: 9 },
  worldPreviewImage: { width: 82, height: 67, borderRadius: 11 },
  worldPreviewCopy: { flex: 1 },
  worldPreviewTitle: { color: '#FFF', fontFamily: typography.display, fontSize: 15, fontWeight: '700' },
  worldPreviewMeta: { color: '#BFB1C3', fontSize: 9, marginTop: 1 },
  worldPreviewBody: { color: '#D3C8D5', fontSize: 9, lineHeight: 13, marginTop: 5 },
  featureStrip: { zIndex: 8, minHeight: 105, flexDirection: 'row', alignItems: 'stretch', marginHorizontal: 14, marginTop: -22, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(205,117,232,.28)', backgroundColor: 'rgba(20,14,28,.96)', shadowColor: '#000', shadowOpacity: .44, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  featureStripWrap: { flexWrap: 'wrap' },
  featureStripCompact: { marginHorizontal: -10, marginTop: 16, borderRadius: 18 },
  stripItem: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 21, paddingVertical: 19, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,.08)' },
  stripItemDesktop: { flex: 1 },
  stripItemWrapped: { width: '50%' },
  stripItemCompact: { width: '100%', borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.08)' },
  stripIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: 'rgba(159,69,191,.13)' },
  stripCopy: { flex: 1 },
  stripTitle: { color: '#FBF5FB', fontSize: 12, fontWeight: '900' },
  stripBody: { color: '#AA9FAE', fontSize: 10, lineHeight: 14, marginTop: 4 },
  section: { paddingTop: 64 },
  deferredSections: { minHeight: 720, paddingTop: 64, gap: 18, overflow: 'hidden' },
  deferredHeading: { width: 230, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.055)' },
  deferredGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  deferredCard: { flexGrow: 1, minWidth: 240, height: 245, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,.055)' },
  sectionHeading: { minHeight: 46, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, marginBottom: 18 },
  sectionHeadingCompact: { alignItems: 'flex-start', flexDirection: 'column', gap: 7 },
  sectionHeadingCopy: { flex: 1 },
  sectionTitle: { color: '#FFF8F4', fontFamily: typography.display, fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -.4 },
  sectionSubtitle: { maxWidth: 620, color: '#AFA3B2', fontSize: 12, lineHeight: 18, marginTop: 5 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8 },
  sectionActionCompact: { alignSelf: 'flex-start', paddingTop: 0 },
  sectionActionText: { color: '#E269E5', fontSize: 11, fontWeight: '800' },
  worldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  worldCard: { position: 'relative', height: 245, overflow: 'hidden', justifyContent: 'space-between', padding: 15, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(217,111,239,.32)', backgroundColor: '#181321', shadowColor: '#000', shadowOpacity: .25, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  worldCardDesktop: { width: '24.25%' },
  worldCardTablet: { width: '49%' },
  worldCardCompact: { width: '100%' },
  worldShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6,4,10,.24)' },
  worldCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  worldEyebrow: { flex: 1, color: '#F1D8B3', fontSize: 8, fontWeight: '900', letterSpacing: .9, textShadowColor: '#000', textShadowRadius: 8 },
  newPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(82,30,97,.76)', borderWidth: 1, borderColor: 'rgba(235,155,255,.35)' },
  newText: { color: '#F5D1FF', fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  worldCardBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 11 },
  worldCardCopy: { flex: 1 },
  worldName: { color: '#FFF', fontFamily: typography.display, fontSize: 25, lineHeight: 29, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 12 },
  worldDescription: { color: '#EEE4EE', fontSize: 11, lineHeight: 16, marginTop: 6, textShadowColor: '#000', textShadowRadius: 9 },
  worldArrow: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,.28)', backgroundColor: 'rgba(4,4,9,.44)' },
  whyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  whyCard: { minHeight: 190, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(212,119,238,.20)', backgroundColor: 'rgba(22,16,30,.72)' },
  whyCardDesktop: { width: '24.25%' },
  whyCardTablet: { width: '49%' },
  whyCardCompact: { width: '100%' },
  whyIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, borderWidth: 1, borderColor: 'rgba(207,111,237,.42)', backgroundColor: 'rgba(124,50,147,.17)', marginBottom: 17 },
  whyTitle: { color: '#FFF8F4', fontFamily: typography.display, fontSize: 18, fontWeight: '700' },
  whyBody: { color: '#AFA3B3', fontSize: 11, lineHeight: 17, marginTop: 8 },
  companionRail: { gap: 11, paddingHorizontal: 2, paddingBottom: 6 },
  companionCard: { position: 'relative', width: 198, height: 340, overflow: 'hidden', justifyContent: 'flex-end', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(217,116,235,.27)', backgroundColor: '#17131E' },
  companionCardCompact: { width: 248, height: 378 },
  companionShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(7,5,11,.23)' },
  companionWorldPill: { position: 'absolute', top: 12, left: 12, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,.21)', backgroundColor: 'rgba(7,6,11,.63)' },
  companionWorldText: { color: '#F7EAF5', fontSize: 8, fontWeight: '900', letterSpacing: .4 },
  companionContent: { padding: 13, paddingTop: 74 },
  companionName: { color: '#FFF', fontFamily: typography.display, fontSize: 22, lineHeight: 25, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 12 },
  companionLocation: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  companionLocationText: { color: '#EDE2EC', fontSize: 9, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 7 },
  companionDescription: { color: '#ECE1EC', fontSize: 10, lineHeight: 14, marginTop: 8, textShadowColor: '#000', textShadowRadius: 7 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 9 },
  tag: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(73,37,81,.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' },
  tagText: { color: '#D8C9D9', fontSize: 7.5, fontWeight: '700' },
  highlights: { minHeight: 116, flexDirection: 'row', alignItems: 'stretch', marginTop: 58, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(207,113,230,.23)', backgroundColor: 'rgba(22,15,30,.76)' },
  highlightsWrap: { flexWrap: 'wrap' },
  highlight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15, padding: 20, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,.08)' },
  highlightDesktop: { flex: 1 },
  highlightWrapped: { width: '50%' },
  highlightValue: { color: '#DCA1F4', fontSize: 20, lineHeight: 24, fontWeight: '800' },
  highlightLabel: { color: '#B7A9BB', fontSize: 10, marginTop: 2 },
  finalCta: { position: 'relative', minHeight: 230, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 36, marginTop: 58, paddingHorizontal: 42, paddingVertical: 36, borderRadius: 27, borderWidth: 1, borderColor: 'rgba(213,103,236,.37)', backgroundColor: '#160D1D' },
  finalCtaCompact: { alignItems: 'stretch', flexDirection: 'column', paddingHorizontal: 24, paddingVertical: 30 },
  finalGlow: { position: 'absolute', top: -150, right: -50, width: 450, height: 450, borderRadius: 225, backgroundColor: 'rgba(175,28,190,.13)' },
  finalCopy: { flex: 1, maxWidth: 760 },
  finalEyebrow: { color: '#DF8FE9', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  finalTitle: { color: '#FFF8F4', fontFamily: typography.display, fontSize: 35, lineHeight: 41, fontWeight: '700', marginTop: 10 },
  finalTitleCompact: { fontSize: 28, lineHeight: 34 },
  finalBody: { maxWidth: 650, color: '#B8ABB9', fontSize: 12, lineHeight: 19, marginTop: 11 },
  footer: { minHeight: 144, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 28, paddingVertical: 34 },
  footerBrand: { maxWidth: 390, gap: 9 },
  footerText: { color: '#817684', fontSize: 10, lineHeight: 15 },
  footerLinks: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  footerLink: { color: '#B8ACBA', fontSize: 11, fontWeight: '700' },
  copyright: { color: '#6D636F', fontSize: 9 },
  pressed: { opacity: .67 },
  cardPressed: { opacity: .88, transform: [{ scale: .987 }] },
});
