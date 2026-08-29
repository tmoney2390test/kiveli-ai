import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  ArrowLeft, BookOpenCheck, CheckCircle2, ChevronDown, ChevronRight, Clock3, Compass, FileQuestion, History,
  Map as MapIcon, MessageCircle, Pin, RotateCcw, Search, Send, Settings,
  Sparkles, Target, UsersRound, X,
} from 'lucide-react-native';
import {
  abandonStoryCampaign, applyStoryCampaignAction, loadStoryCampaign, pinStoryItem,
  restartStoryCampaign, sendStoryDialogue, updateStorySettings,
} from '../lib/api';
import { shouldConsumeComposerEnter, shouldSendComposerOnEnter } from '../lib/composerKeyboard';
import { confirmAction } from '../lib/dialogs';
import { createClientRequestId } from '../lib/requestId';
import { characterAssets } from '../assets';
import { FrostedSurface } from '../components/FrostedGlass';
import { mappedLocationAsset } from '../location-assets';
import { colors, typography } from '../theme';
import { storyArtwork, storyConceptAssets } from './assets';
import { MobileStoryHeader } from './MobileStoryHeader';
import { storyMapHotspot } from './storyMapLayout';
import { initialStoryConversationId, resolveStoryConversationPerson, storyPersonIsPresent, storyRelationshipLabel, usesSplitStoryLayout, visibleStoryMessages } from './storyPresentation';
import type { StoryAction, StoryCampaign, StoryPerson } from './types';

type ViewKey = 'scene' | 'map' | 'timeline' | 'evidence' | 'people' | 'recap' | 'settings';

const views: Array<{ key: ViewKey; label: string; icon: ComponentType<{ size?: number; color?: string }> }> = [
  { key: 'scene', label: 'Scene', icon: Sparkles },
  { key: 'map', label: 'Map', icon: MapIcon },
  { key: 'timeline', label: 'Timeline', icon: History },
  { key: 'evidence', label: 'Evidence', icon: BookOpenCheck },
  { key: 'people', label: 'Characters', icon: UsersRound },
  { key: 'recap', label: 'Campaign', icon: FileQuestion },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export function StoryPlayScreen({ campaignId, onExit, onCampaignReplaced, initialCampaign }: { campaignId: string; onExit?: () => void; onCampaignReplaced?: (campaignId: string) => void; initialCampaign?: StoryCampaign }) {
  const { width } = useWindowDimensions();
  const split = usesSplitStoryLayout(width);
  const [campaign, setCampaign] = useState<StoryCampaign | null>(initialCampaign ?? null);
  const [activeView, setActiveView] = useState<ViewKey>('scene');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [storyMenuOpen, setStoryMenuOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [stream, setStream] = useState('');
  const openedInitialMobileChatRef = useRef(false);

  const exit = () => (onExit ? onExit() : router.push('/stories' as never));
  const load = useCallback(async () => {
    if (initialCampaign) { setCampaign(initialCampaign); return; }
    setError('');
    try {
      const { campaign: next } = await loadStoryCampaign(campaignId);
      setCampaign(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The campaign could not be loaded.');
    }
  }, [campaignId, initialCampaign]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (campaign && !selectedPersonId) setSelectedPersonId(initialStoryConversationId(campaign));
  }, [campaign, selectedPersonId]);
  useEffect(() => { if (split) setMobileChatOpen(false); }, [split]);
  useEffect(() => {
    if (!split && selectedPersonId && !openedInitialMobileChatRef.current) {
      openedInitialMobileChatRef.current = true;
      setMobileChatOpen(true);
    }
  }, [selectedPersonId, split]);

  const run = async (action: StoryAction) => {
    if (!campaign || busy) return;
    setBusy(action.type); setError('');
    try {
      const result = await applyStoryCampaignAction(campaign.id, campaign.version, action, createClientRequestId());
      setCampaign(result.campaign);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The story could not advance.');
      if (caught instanceof Error && caught.message.includes('another device')) void load();
    } finally { setBusy(''); }
  };

  const pin = async (target: 'evidence' | 'character' | 'event', id: string, pinned: boolean) => {
    if (!campaign || busy) return;
    setBusy(`pin-${target}`); setError('');
    try {
      const result = await pinStoryItem(campaign.id, campaign.version, target, pinned ? null : id, createClientRequestId());
      setCampaign(result.campaign);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That item could not be pinned.');
    } finally { setBusy(''); }
  };

  const restart = () => {
    if (!campaign || busy) return;
    const currentCampaign = campaign;
    confirmAction({
      title: 'Restart this story?',
      message: 'Your current campaign will be archived. Discovered endings remain in the archive, but this run begins again from 8:40 PM.',
      confirmLabel: 'Restart',
      destructive: true,
      onConfirm: async () => {
      setBusy('restart'); setError('');
      try {
        const result = await restartStoryCampaign(currentCampaign.id, createClientRequestId());
        setCampaign(result.campaign);
        setStream('');
        setSelectedPersonId('');
        openedInitialMobileChatRef.current = false;
        setMobileChatOpen(!split);
        setActiveView('scene');
        onCampaignReplaced?.(result.campaign.id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The story could not restart.');
      } finally { setBusy(''); }
      },
    });
  };

  const abandon = () => {
    if (!campaign || busy) return;
    const currentCampaign = campaign;
    confirmAction({
      title: 'End this campaign?',
      message: 'This run will close. Your discovered endings remain in the archive.',
      confirmLabel: 'End campaign',
      destructive: true,
      onConfirm: async () => {
        setBusy('abandon'); setError('');
        try {
          await abandonStoryCampaign(currentCampaign.id, currentCampaign.version, createClientRequestId());
          router.replace('/stories' as never);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'The campaign could not be ended.');
        } finally { setBusy(''); }
      },
    });
  };

  if (!campaign && !error) return <View style={styles.loading}><ActivityIndicator color="#67D7C1" size="large" /><Text style={styles.muted}>Restoring the loop…</Text></View>;
  if (!campaign) return <View style={styles.loading}><Text style={styles.error}>{error}</Text><Pressable onPress={() => void load()} style={styles.smallButton}><Text style={styles.smallButtonText}>Try again</Text></Pressable></View>;

  const selectedPerson = resolveStoryConversationPerson(campaign, selectedPersonId);
  const openConversation = (id: string) => { setSelectedPersonId(id); if (!split) setMobileChatOpen(true); };
  const storyArt = storyArtwork[campaign.storySlug as keyof typeof storyArtwork] ?? storyArtwork['the-last-night-in-vespormoor'];
  const locationArt = mappedLocationAsset(campaign.worldId, campaign.currentLocation.artworkKey) ?? storyArt;
  const selectMobileView = (view: ViewKey) => {
    setActiveView(view);
    setMobileChatOpen(false);
    setStoryMenuOpen(false);
  };

  const conversationProps = {
    campaign, person: selectedPerson, stream, busy, onSelect: setSelectedPersonId,
    onStream: setStream, onCampaign: setCampaign, onBusy: setBusy, onError: setError,
    onStoryAction: (action: StoryAction) => void run(action),
    onFollow: (characterId: string) => void run({ type: 'follow', characterId }),
    onAbsence: (characterId: string, choice: 'wait' | 'leave_note' | 'ask_nearby') => void run({ type: 'absence', characterId, choice }),
    onCheckMap: () => { setActiveView('map'); setMobileChatOpen(false); },
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.shell, split && styles.shellDesktop]}>
        {split ? <StoryHeader campaign={campaign} split onExit={exit} /> : (
          <MobileStoryHeader
            locationName={campaign.currentLocation.name}
            subtitle={`${campaign.title} · ${campaign.currentTime}`}
            imageSource={locationArt}
            activeView={mobileChatOpen ? 'chat' : activeView}
            onBack={exit}
            onMap={() => selectMobileView('map')}
            onScene={() => selectMobileView('scene')}
            onMenu={() => setStoryMenuOpen(true)}
          />
        )}
        <View style={[styles.workspace, split && styles.workspaceDesktop]}>
          {!split && mobileChatOpen && selectedPerson ? (
            <ConversationPanel {...conversationProps} compact onClose={() => setMobileChatOpen(false)} />
          ) : (
            <ScrollView style={styles.main} contentContainerStyle={[styles.mainContent, split && styles.mainContentDesktop]} showsVerticalScrollIndicator={false}>
              {error ? <Pressable onPress={() => setError('')} style={styles.errorBanner}><Text style={styles.error}>{error}</Text></Pressable> : null}
              {campaign.status === 'midnight' ? <MidnightPanel campaign={campaign} busy={busy} onReset={() => void run({ type: 'reset' })} /> : null}
              {campaign.completedEnding ? <EndingPanel campaign={campaign} /> : null}
              {activeView === 'scene' ? <SceneView campaign={campaign} busy={busy} selectedPersonId={selectedPersonId} singleColumn={!split} onAction={(action) => void run(action)} onTalk={openConversation} onOpenMap={() => setActiveView('map')} /> : null}
              {activeView === 'map' ? <MapView campaign={campaign} busy={busy} onTravel={(locationId) => void run({ type: 'travel', locationId })} /> : null}
              {activeView === 'timeline' ? <TimelineView campaign={campaign} busy={busy} onPin={(id, pinned) => void pin('event', id, pinned)} /> : null}
              {activeView === 'evidence' ? <EvidenceView campaign={campaign} busy={busy} onPin={(id, pinned) => void pin('evidence', id, pinned)} /> : null}
              {activeView === 'people' ? <PeopleView campaign={campaign} busy={busy} onPin={(id, pinned) => void pin('character', id, pinned)} onTalk={(id) => { setActiveView('scene'); openConversation(id); }} /> : null}
              {activeView === 'recap' ? <RecapView campaign={campaign} /> : null}
              {activeView === 'settings' ? <SettingsView campaign={campaign} busy={busy} onChange={async (settings) => {
                setBusy('settings');
                try { const result = await updateStorySettings(campaign.id, campaign.version, settings, createClientRequestId()); setCampaign(result.campaign); }
                catch (caught) { setError(caught instanceof Error ? caught.message : 'Settings could not be saved.'); }
                finally { setBusy(''); }
              }} onRestart={restart} onAbandon={abandon} /> : null}
            </ScrollView>
          )}
          {split ? <ConversationPanel {...conversationProps} /> : null}
        </View>

        {!split && !mobileChatOpen && selectedPerson ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open conversation with ${selectedPerson.name}`} onPress={() => setMobileChatOpen(true)} style={styles.mobileChatDock}>
            <StoryPortrait person={selectedPerson} size={36} />
            <View style={styles.mobileChatDockCopy}><Text style={styles.mobileChatDockLabel}>CONVERSATION</Text><Text style={styles.mobileChatDockName} numberOfLines={1}>Chat with {selectedPerson.name}</Text></View>
            <MessageCircle size={19} color="#A5EEE0" />
          </Pressable>
        ) : null}
        {!split ? <StoryViewMenu visible={storyMenuOpen} activeView={activeView} onClose={() => setStoryMenuOpen(false)} onSelect={selectMobileView} /> : null}
        {split ? <StoryNavigation activeView={activeView} onSelect={(view) => { setActiveView(view); setMobileChatOpen(false); }} /> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function StoryViewMenu({ visible, activeView, onClose, onSelect }: {
  visible: boolean;
  activeView: ViewKey;
  onClose: () => void;
  onSelect: (view: ViewKey) => void;
}) {
  const menuViews = views.filter(({ key }) => key !== 'scene' && key !== 'map');
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <Pressable accessibilityLabel="Close story menu" onPress={onClose} style={styles.storyMenuBackdrop}>
      <Pressable onPress={(event) => event.stopPropagation()} style={styles.storyMenuPosition}>
        <FrostedSurface intensity={92} style={styles.storyMenuGlass}>
          <View style={styles.storyMenuHeader}>
            <View><Text style={styles.storyMenuKicker}>STORY</Text><Text style={styles.storyMenuTitle}>More options</Text></View>
            <Pressable accessibilityLabel="Close story menu" hitSlop={10} onPress={onClose} style={styles.storyMenuClose}><X size={20} color={colors.text} /></Pressable>
          </View>
          <View style={styles.storyMenuGrid}>{menuViews.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.key;
            return <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => onSelect(item.key)} style={({ pressed }) => [styles.storyMenuItem, active && styles.storyMenuItemActive, pressed && styles.pressed]}>
              <Icon size={20} color={active ? '#A5EEE0' : '#C6BECA'} />
              <Text style={[styles.storyMenuItemText, active && styles.storyMenuItemTextActive]}>{item.label}</Text>
            </Pressable>;
          })}</View>
        </FrostedSurface>
      </Pressable>
    </Pressable>
  </Modal>;
}

function StoryHeader({ campaign, split, onExit }: { campaign: StoryCampaign; split: boolean; onExit: () => void }) {
  return <View style={[styles.topbar, split && styles.topbarDesktop]}>
    <Pressable accessibilityLabel="Back to Stories" accessibilityRole="button" onPress={onExit} style={styles.iconButton}><ArrowLeft size={21} color={colors.text} /></Pressable>
    <View style={styles.topCopy}><Text style={styles.topTitle} numberOfLines={1}>{campaign.title}</Text><Text style={styles.topMeta} numberOfLines={1}>{campaign.currentLocation.name} · Chapter One</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.headerStats}>
      <HeaderStat label="Loop" value={String(campaign.loop + 1)} />
      <HeaderStat label="Time" value={campaign.currentTime} icon />
      <HeaderStat label="Facts" value={`${campaign.factsDiscovered}/${campaign.factsTotal || 40}`} />
      <HeaderStat label="Midnight" value={`${campaign.minutesToMidnight}m`} warning />
    </ScrollView>
  </View>;
}

function HeaderStat({ label, value, icon = false, warning = false }: { label: string; value: string; icon?: boolean; warning?: boolean }) {
  return <View style={[styles.headerStat, warning && styles.headerStatWarning]}>{icon ? <Clock3 size={13} color="#E4BC69" /> : null}<Text style={styles.headerStatLabel}>{label}</Text><Text style={[styles.headerStatValue, warning && styles.headerStatWarningText]}>{value}</Text></View>;
}

function StoryNavigation({ activeView, onSelect, compact = false }: { activeView: ViewKey; onSelect: (view: ViewKey) => void; compact?: boolean }) {
  return <ScrollView horizontal style={[styles.nav, compact && styles.navCompact]} contentContainerStyle={styles.navContent} showsHorizontalScrollIndicator={false}>{views.map((item) => {
    const Icon = item.icon; const active = activeView === item.key;
    return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`${item.label} story view`} key={item.key} onPress={() => onSelect(item.key)} style={({ pressed }) => [styles.navItem, compact && styles.navItemCompact, active && styles.navItemActive, compact && active && styles.navItemCompactActive, pressed && styles.pressed]}><Icon size={compact ? 18 : 20} color={active ? '#7CE0CC' : '#918B96'} /><Text style={[styles.navLabel, compact && styles.navLabelCompact, active && styles.navLabelActive]}>{item.label}</Text></Pressable>;
  })}</ScrollView>;
}

function SceneView({ campaign, busy, selectedPersonId, singleColumn, onAction, onTalk, onOpenMap }: {
  campaign: StoryCampaign; busy: string; selectedPersonId: string; singleColumn: boolean;
  onAction: (action: StoryAction) => void; onTalk: (id: string) => void; onOpenMap: () => void;
}) {
  const [peopleOpen, setPeopleOpen] = useState(false);
  const art = storyArtwork[campaign.storySlug as keyof typeof storyArtwork] ?? storyArtwork['the-last-night-in-vespormoor'];
  const sceneArt = mappedLocationAsset(campaign.worldId, campaign.currentLocation.artworkKey) ?? art;
  const scenePeople = [...campaign.presentCharacters, ...campaign.othersNearby];
  const recommendedSources = new Set(campaign.guidance.leads.map((lead) => lead.sourceId));
  const optionalInteractions = campaign.interactions.filter((item) => !recommendedSources.has(item.id));
  const actOnLead = (lead: StoryCampaign['guidance']['leads'][number]) => {
    if (lead.kind === 'conversation' && lead.characterId && lead.availableNow) onTalk(lead.characterId);
    else if (lead.kind === 'investigation' && lead.interactionId && lead.availableNow) onAction({ type: 'investigate', interactionId: lead.interactionId });
    else if (lead.kind === 'finale' && lead.endingId) onAction({ type: 'finale', endingId: lead.endingId });
    else onOpenMap();
  };
  return <View style={styles.stack}>
    <View style={[styles.sceneHero, singleColumn && styles.sceneHeroCompact]}>
      <Image source={sceneArt} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sceneTint]} />
      <View pointerEvents="none" style={styles.sceneLowerShade} />
      <View pointerEvents="none" style={styles.sceneBottomShade} />
      <View style={styles.sceneCopy}>
        <View style={styles.sceneKickerRow}><Text style={styles.eyebrow}>CURRENT SCENE</Text><Text style={styles.sceneTime}>{campaign.currentTime}</Text></View>
        <Text style={styles.sceneTitle}>{campaign.currentLocation.name}</Text>
        <Text style={styles.sceneSubtitle}>{campaign.currentLocation.subtitle}</Text>
        <Text style={styles.bodyText} numberOfLines={3}>{campaign.currentLocation.description}</Text>
      </View>
    </View>
    <StoryDirectionPanel campaign={campaign} busy={busy} onLead={actOnLead} />
    <PinnedLead campaign={campaign} />
    {campaign.proactiveBeat ? <ProactiveStoryBeat campaign={campaign} onTalk={onTalk} /> : null}
    {campaign.arrivalOpportunity ? <Pressable accessibilityRole="button" accessibilityLabel={`Talk to ${campaign.arrivalOpportunity.name}, who just arrived`} onPress={() => onTalk(campaign.arrivalOpportunity!.characterId)} style={styles.arrivalOpportunity}><StoryPortrait person={campaign.arrivalOpportunity} size={42} /><View style={styles.flexOne}><Text style={styles.eyebrow}>JUST ARRIVED</Text><Text style={styles.arrivalTitle}>{campaign.arrivalOpportunity.name}</Text><Text style={styles.personActivity} numberOfLines={1}>{campaign.arrivalOpportunity.activity ?? 'Available to talk'}</Text></View><MessageCircle size={18} color="#9BE9DA" /></Pressable> : null}
    {singleColumn && scenePeople.length ? <CompactStoryPeopleButton people={scenePeople} label={`${scenePeople.length} ${scenePeople.length === 1 ? 'person' : 'people'} nearby`} onPress={() => setPeopleOpen(true)} /> : campaign.presentCharacters.length ? <Section title="People worth speaking with" subtitle="Recommended first, with everyone else still available">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleStrip}>
        {[...campaign.presentCharacters].sort((left, right) => Number(campaign.guidance.leads.some((lead) => lead.characterId === right.id)) - Number(campaign.guidance.leads.some((lead) => lead.characterId === left.id))).map((person) => {
          const selected = person.id === selectedPersonId;
          return <Pressable accessibilityRole="button" accessibilityLabel={`Talk to ${person.name}`} key={person.id} onPress={() => onTalk(person.id)} style={({ pressed }) => [styles.personChip, selected && styles.personChipActive, pressed && styles.pressed]}>
            <StoryPortrait person={person} size={54} />
            <View style={styles.personChipCopy}><Text style={styles.personName}>{person.name}</Text><Text style={styles.personActivity} numberOfLines={2}>{person.activity}</Text>{person.departureWarning ? <Text style={styles.leavingSoon}>Leaving in {person.departureWarning.minutesUntil}m</Text> : null}</View>
            <View style={styles.chatIndicator}><MessageCircle size={16} color="#A5EEE0" /></View>
          </Pressable>;
        })}
      </ScrollView>
    </Section> : <View style={styles.quiet}><Text style={styles.quietTitle}>The room is quiet.</Text><Text style={styles.muted}>Someone may arrive later, or another place may hold the lead you need.</Text></View>}
    {!singleColumn && campaign.othersNearby?.length ? <Section title="Others nearby" subtitle="Residents following ordinary schedules"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleStrip}>{campaign.othersNearby.map((person) => <Pressable accessibilityRole="button" accessibilityLabel={`Talk to ${person.name}`} onPress={() => onTalk(person.id)} key={person.id} style={({ pressed }) => [styles.ambientChip, pressed && styles.pressed]}><StoryPortrait person={person} size={38} /><View style={styles.personChipCopy}><Text style={styles.personName}>{person.name}</Text><Text style={styles.personActivity} numberOfLines={1}>{person.activity}</Text></View><MessageCircle size={14} color="#8CACA5" /></Pressable>)}</ScrollView></Section> : null}
    {singleColumn ? <StoryPeopleChooser visible={peopleOpen} title="People nearby" present={campaign.presentCharacters} nearby={campaign.othersNearby} selectedId={selectedPersonId} onClose={() => setPeopleOpen(false)} onSelect={(id) => { setPeopleOpen(false); onTalk(id); }} /> : null}
    {optionalInteractions.length ? <Section title="Optional exploration" subtitle="Useful possibilities that are not required right now">
      <View style={styles.actionGrid}>{optionalInteractions.map((item) => <Pressable
        accessibilityRole="button" accessibilityState={{ disabled: Boolean(busy) }} key={item.id}
        disabled={Boolean(busy)} onPress={() => onAction({ type: 'investigate', interactionId: item.id })}
        style={({ pressed }) => [styles.actionCard, singleColumn && styles.actionCardSingle, pressed && styles.pressed, busy && styles.disabled]}
      >
        <View style={styles.actionTop}><View style={styles.actionIcon}><Search size={18} color={item.newInformation ? '#72D7C3' : '#B28AE3'} /></View><Text style={styles.timeCost}>+{item.timeCost} min</Text></View>
        <Text style={styles.actionTitle}>{item.title}</Text><Text style={styles.actionBody}>{item.description}</Text>
        <Text style={[styles.outcomeHint, item.newInformation && styles.newLead]}>{item.newInformation ? 'NEW LEAD POSSIBLE' : 'MAY CHANGE THE TIMELINE'}</Text>
      </Pressable>)}</View>
    </Section> : null}
    {campaign.availableEndings.length ? <Section title="The night can end here" subtitle="Your deductions have opened a final choice"><View style={styles.stack}>{campaign.availableEndings.map((ending) => <Pressable key={ending.id} onPress={() => onAction({ type: 'finale', endingId: ending.id })} style={styles.endingChoice}><View style={styles.flexOne}><Text style={styles.actionTitle}>{ending.title}</Text><Text style={styles.actionBody}>{ending.description}</Text></View><ChevronRight size={19} color="#E4BC69" /></Pressable>)}</View></Section> : null}
  </View>;
}

function StoryDirectionPanel({ campaign, busy, onLead }: { campaign: StoryCampaign; busy: string; onLead: (lead: StoryCampaign['guidance']['leads'][number]) => void }) {
  const guidance = campaign.guidance;
  return <View style={styles.directionPanel}>
    {guidance.recentOutcome ? <View style={[styles.outcomePanel, guidance.recentOutcome.madeProgress && styles.outcomePanelProgress]}>
      <View style={styles.outcomeIcon}>{guidance.recentOutcome.madeProgress ? <CheckCircle2 size={17} color="#88E2D0" /> : <Compass size={17} color="#C7AADF" />}</View>
      <View style={styles.flexOne}><Text style={styles.outcomeTitle}>{guidance.recentOutcome.title}</Text><Text style={styles.outcomeText}>{guidance.recentOutcome.detail} Next: {guidance.recentOutcome.next}.</Text></View>
    </View> : null}
    <View style={styles.directionHeading}>
      <View style={styles.directionPhase}><Target size={14} color="#86E1CF" /><Text style={styles.directionPhaseText}>{guidance.phaseLabel.toUpperCase()}</Text></View>
      {guidance.hintLevel ? <Text style={styles.directionHint}>{guidance.hintLevel === 2 ? 'CLEAR DIRECTION' : 'A LITTLE HELP'}</Text> : null}
    </View>
    <Text style={styles.directionTitle}>What matters now</Text>
    <Text style={styles.directionObjective}>{guidance.objective}</Text>
    <Text style={styles.directionReason}>{guidance.objectiveReason}</Text>
    {guidance.leads.length ? <View style={styles.directionLeads}>{guidance.leads.map((lead, index) => <Pressable
      key={lead.id} accessibilityRole="button" accessibilityLabel={`${lead.actionLabel}: ${lead.title}`} disabled={Boolean(busy)} onPress={() => onLead(lead)}
      style={({ pressed }) => [styles.directionLead, index === 0 && styles.directionLeadPrimary, pressed && styles.pressed, Boolean(busy) && styles.disabled]}
    >
      <View style={[styles.directionLeadNumber, index === 0 && styles.directionLeadNumberPrimary]}><Text style={styles.directionLeadNumberText}>{index + 1}</Text></View>
      <View style={styles.flexOne}><Text style={styles.directionLeadTitle}>{lead.title}</Text><Text style={styles.directionLeadReason}>{lead.reason}</Text></View>
      <View style={styles.directionLeadAction}><Text style={styles.directionLeadActionText}>{lead.actionLabel}</Text><ChevronRight size={15} color="#91E5D5" /></View>
    </Pressable>)}</View> : <Text style={styles.directionEmpty}>Let the scene develop or speak with someone nearby.</Text>}
  </View>;
}

function ProactiveStoryBeat({ campaign, onTalk }: { campaign: StoryCampaign; onTalk: (id: string) => void }) {
  const beat = campaign.proactiveBeat;
  const person = beat ? campaign.presentCharacters.find((item) => item.id === beat.characterId) : null;
  if (!beat || !person) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Respond to ${person.name}`} onPress={() => onTalk(person.id)} style={[storyStyles.proactiveBeat, beat.tone === 'pressure' && storyStyles.proactiveBeatPressure]}>
    <StoryPortrait person={person} size={46} />
    <View style={styles.flexOne}><Text style={styles.eyebrow}>A MOMENT OPENS</Text><Text style={storyStyles.proactiveTitle}>{beat.title}</Text><Text style={styles.actionBody} numberOfLines={3}>{beat.body}</Text></View>
    <ChevronRight size={19} color="#8FE5D5" />
  </Pressable>;
}

function CompactStoryPeopleButton({ people, label, onPress }: { people: Array<{ id: string; name: string; portraitSlug: string }>; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Choose from ${label}`} onPress={onPress} style={({ pressed }) => [styles.compactPeopleButton, pressed && styles.pressed]}>
    <View style={styles.compactPeopleAvatars}>{people.slice(0, 3).map((person, index) => <View key={person.id} style={[styles.compactPeopleAvatar, index > 0 && styles.compactPeopleAvatarOverlap]}><StoryPortrait person={person} size={34} /></View>)}</View>
    <View style={styles.flexOne}><Text style={styles.compactPeopleKicker}>PEOPLE HERE</Text><Text style={styles.compactPeopleLabel}>{label}</Text></View>
    <ChevronRight size={19} color="#91E5D5" />
  </Pressable>;
}

function StoryPeopleChooser({ visible, title, present, nearby, selectedId, onClose, onSelect }: {
  visible: boolean;
  title: string;
  present: StoryPerson[];
  nearby: StoryPerson[];
  selectedId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <Pressable accessibilityLabel="Close person chooser" onPress={onClose} style={styles.peopleChooserBackdrop}>
      <Pressable onPress={(event) => event.stopPropagation()} style={styles.peopleChooserPosition}>
        <FrostedSurface intensity={94} style={styles.peopleChooserGlass}>
          <View style={styles.peopleChooserHeader}><View><Text style={styles.peopleChooserKicker}>CURRENT SCENE</Text><Text style={styles.peopleChooserTitle}>{title}</Text></View><Pressable accessibilityLabel="Close person chooser" onPress={onClose} style={styles.peopleChooserClose}><X size={20} color={colors.text} /></Pressable></View>
          <ScrollView style={styles.peopleChooserScroll} contentContainerStyle={styles.peopleChooserContent} showsVerticalScrollIndicator={false}>
            {present.length ? <Text style={styles.peopleChooserSection}>HERE NOW</Text> : null}
            {present.map((person) => <StoryPersonChoice key={person.id} person={person} selected={person.id === selectedId} nearby={false} onPress={() => onSelect(person.id)} />)}
            {nearby.length ? <Text style={styles.peopleChooserSection}>OTHERS NEARBY</Text> : null}
            {nearby.map((person) => <StoryPersonChoice key={person.id} person={person} selected={person.id === selectedId} nearby onPress={() => onSelect(person.id)} />)}
          </ScrollView>
        </FrostedSurface>
      </Pressable>
    </Pressable>
  </Modal>;
}

function StoryPersonChoice({ person, selected, nearby, onPress }: { person: StoryPerson; selected: boolean; nearby: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Talk to ${person.name}`} onPress={onPress} style={({ pressed }) => [styles.peopleChooserRow, selected && styles.peopleChooserRowActive, pressed && styles.pressed]}>
    <StoryPortrait person={person} size={48} />
    <View style={styles.flexOne}><Text style={styles.peopleChooserName}>{person.name}</Text><Text style={styles.peopleChooserActivity} numberOfLines={2}>{person.activity ?? person.role}</Text>{person.departureWarning ? <Text style={styles.leavingSoon}>Leaving in {person.departureWarning.minutesUntil}m</Text> : null}</View>
    <Text style={[styles.peopleChooserStatus, nearby && styles.peopleChooserStatusNearby]}>{nearby ? 'NEARBY' : 'HERE'}</Text>
  </Pressable>;
}

function StoryCharacterPopup({ visible, person, present, locationName, onClose }: {
  visible: boolean;
  person: StoryPerson;
  present: boolean;
  locationName: string;
  onClose: () => void;
}) {
  const firstName = person.name.split(' ')[0] ?? person.name;
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <Pressable accessibilityLabel="Close character details" onPress={onClose} style={styles.characterPopupBackdrop}>
      <Pressable onPress={(event) => event.stopPropagation()} style={styles.characterPopupPosition}>
        <FrostedSurface intensity={94} style={styles.characterPopupGlass}>
          <View style={styles.characterPopupHeader}>
            <StoryPortrait person={person} size={76} />
            <View style={styles.flexOne}><Text style={styles.characterPopupKicker}>{present ? 'HERE IN THIS SCENE' : 'ELSEWHERE IN THE STORY'}</Text><Text style={styles.characterPopupName}>{person.name}</Text><Text style={styles.characterPopupRole}>{person.role}</Text></View>
            <Pressable accessibilityLabel="Close character details" onPress={onClose} style={styles.characterPopupClose}><X size={20} color={colors.text} /></Pressable>
          </View>
          <View style={styles.characterPopupFact}>
            <Text style={styles.characterPopupFactLabel}>RIGHT NOW · {locationName.toUpperCase()}</Text>
            <Text style={styles.characterPopupFactText}>{person.activity ?? `${firstName} is following their own route through the night.`}</Text>
            {present && person.departureWarning ? <Text style={styles.characterPopupDeparture}>Leaving at {person.departureWarning.time} · {person.departureWarning.minutesUntil} min</Text> : null}
          </View>
          <View style={styles.characterPopupFact}>
            <Text style={styles.characterPopupFactLabel}>YOUR CONNECTION</Text>
            <Text style={styles.characterPopupFactText}>{firstName} {storyRelationshipLabel(person)}</Text>
          </View>
          <View style={styles.characterPopupMeters}><Meter label="Trust" value={person.trust} color="#65D6BE" /><Meter label="Suspicion" value={person.suspicion} color="#D27B9E" /></View>
          {person.biography ? <Text style={styles.characterPopupBio}>{person.biography}</Text> : null}
        </FrostedSurface>
      </Pressable>
    </Pressable>
  </Modal>;
}

function PinnedLead({ campaign }: { campaign: StoryCampaign }) {
  const evidence = campaign.evidence.find((item) => item.pinned);
  const person = campaign.dossiers.find((item) => item.pinned);
  const event = campaign.timeline.find((item) => item.pinned);
  if (!evidence && !person && !event) return null;
  return <View style={[styles.quiet, storyStyles.pinnedCard]}><View style={storyStyles.pinnedHeading}><Pin size={14} color="#E2C575" /><Text style={styles.eyebrow}>PINNED LEAD</Text></View><Text style={styles.quietTitle}>{evidence?.title ?? person?.name ?? event?.title}</Text><Text style={styles.muted}>{evidence?.description ?? (person ? `Track ${person.name} and what they know about this night.` : 'Watch for this event as the loop unfolds.')}</Text></View>;
}

function MapView({ campaign, busy, onTravel }: { campaign: StoryCampaign; busy: string; onTravel: (id: string) => void }) {
  const { width } = useWindowDimensions();
  const mobile = width < 900;
  const [selectedLocation, setSelectedLocation] = useState<StoryCampaign['locations'][number] | null>(null);
  const travelAvailable = Boolean(selectedLocation?.unlocked && !selectedLocation.current && selectedLocation.travelMinutes !== null && !busy);
  const confirmTravel = () => {
    if (!selectedLocation || !travelAvailable) return;
    const locationId = selectedLocation.id;
    setSelectedLocation(null);
    onTravel(locationId);
  };
  return <View style={styles.mapView}>
    {mobile ? <MapStatusHeader campaign={campaign} mobile /> : null}
    <View style={styles.mapCanvas}>
      <Image source={storyConceptAssets.map} style={styles.mapArtwork} contentFit="contain" contentPosition="top" />
      <View pointerEvents="none" style={styles.mapVignette} />
      {!mobile ? <MapStatusHeader campaign={campaign} /> : null}
      {campaign.locations.map((location, index) => {
        const hotspot = storyMapHotspot(location.id, index);
        return <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${location.name}. ${location.current ? 'Current location' : !location.unlocked ? 'Locked' : `${location.travelMinutes} minute travel`}`}
          key={location.id}
          disabled={Boolean(busy)}
          onPress={() => setSelectedLocation(location)}
          style={[styles.mapHitArea, { left: `${hotspot.left}%`, top: `${hotspot.top}%`, width: `${hotspot.width}%` }]}
        />;
      })}
      {busy === 'travel' || busy === 'follow' ? <View pointerEvents="none" style={styles.mapBusy}><ActivityIndicator color="#8FE5D5" /><Text style={styles.mapBusyText}>{busy === 'follow' ? 'Following the trail…' : 'Crossing Vespormoor…'}</Text></View> : null}
    </View>
    <Modal visible={Boolean(selectedLocation)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSelectedLocation(null)}>
      <Pressable accessibilityLabel="Close location details" onPress={() => setSelectedLocation(null)} style={styles.locationModalBackdrop}>
        <Pressable onPress={(event) => event.stopPropagation()} style={styles.locationModalPosition}>
          <FrostedSurface intensity={94} style={styles.locationModalGlass}>
            <View style={styles.locationModalHeading}>
              <View style={styles.locationModalIcon}><MapIcon size={20} color="#91E5D5" /></View>
              <View style={styles.flexOne}>
                <Text style={styles.locationModalKicker}>{selectedLocation?.current ? 'CURRENT LOCATION' : selectedLocation?.unlocked ? 'AVAILABLE DESTINATION' : 'UNDISCOVERED'}</Text>
                <Text style={styles.locationModalTitle}>{selectedLocation?.name}</Text>
              </View>
              <Pressable accessibilityLabel="Close location details" hitSlop={10} onPress={() => setSelectedLocation(null)} style={styles.locationModalClose}><X size={19} color={colors.text} /></Pressable>
            </View>
            <Text style={styles.locationModalSubtitle}>{selectedLocation?.subtitle}</Text>
            <Text style={styles.locationModalDescription}>{selectedLocation?.description}</Text>
            {selectedLocation?.knownCharacters.length ? <View style={styles.locationPeoplePanel}>
              <View style={styles.locationPeopleHeading}><UsersRound size={15} color="#91E5D5" /><Text style={styles.locationPeopleLabel}>KNOWN TO BE HERE</Text></View>
              {selectedLocation.knownCharacters.map((person) => <View key={person.id} style={styles.locationPersonRow}>
                <StoryPortrait person={person} size={34} />
                <View style={styles.flexOne}><Text style={styles.locationPersonName}>{person.name}</Text><Text style={styles.locationPersonActivity} numberOfLines={2}>{person.activity ?? 'Their exact activity is unclear.'}</Text></View>
              </View>)}
            </View> : null}
            <View style={styles.locationModalActions}>
              <Pressable accessibilityRole="button" onPress={() => setSelectedLocation(null)} style={styles.locationCancelButton}><Text style={styles.locationCancelText}>Cancel</Text></Pressable>
              {travelAvailable ? <Pressable accessibilityRole="button" accessibilityLabel={`Travel to ${selectedLocation?.name}`} onPress={confirmTravel} style={styles.locationTravelButton}><Text style={styles.locationTravelText}>Travel · {selectedLocation?.travelMinutes} min</Text><ChevronRight size={18} color="#07110F" /></Pressable> : <View style={styles.locationUnavailableButton}><Text style={styles.locationUnavailableText}>{selectedLocation?.current ? 'You are here' : selectedLocation?.unlocked ? 'No route available' : 'Not yet discovered'}</Text></View>}
            </View>
          </FrostedSurface>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

function MapStatusHeader({ campaign, mobile = false }: { campaign: StoryCampaign; mobile?: boolean }) {
  return <View pointerEvents="none" style={[styles.mapStatusBar, mobile && styles.mapStatusBarMobile]}>
    <View><Text style={styles.mapKicker}>VESPERMOOR · LOOP {campaign.loop + 1}</Text><Text style={styles.mapPrompt}>Choose directly on the map</Text></View>
    <View style={styles.mapClock}><Clock3 size={14} color="#E2C575" /><Text style={styles.mapClockText}>{campaign.currentTime}</Text></View>
  </View>;
}

function TimelineView({ campaign, busy, onPin }: { campaign: StoryCampaign; busy: string; onPin: (id: string, pinned: boolean) => void }) {
  return <View style={styles.stack}><View style={styles.visualHero}><Image source={storyConceptAssets.timeline} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" /><View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.visualShade]} /><View style={styles.visualCaption}><Text style={styles.eyebrow}>KNOWN TIMELINE</Text><Text style={styles.visualTitle}>The night repeats. Your knowledge does not.</Text></View></View><View style={styles.timeline}>{campaign.timeline.map((event, index) => <View key={event.id} style={styles.timelineRow}><View style={styles.timelineRail}><View style={[styles.timelineDot, event.known && styles.timelineDotKnown, event.witnessed && styles.timelineDotNow]} />{index < campaign.timeline.length - 1 ? <View style={styles.timelineLine} /> : null}</View><View style={styles.timelineCard}><View style={storyStyles.itemHeading}><View style={styles.flexOne}><Text style={styles.timelineTime}>{event.time}</Text><Text style={[styles.actionTitle, !event.known && styles.unknown]}>{event.title}</Text></View>{event.known ? <PinButton label="timeline event" pinned={event.pinned} disabled={Boolean(busy)} onPress={() => onPin(event.id, event.pinned)} /> : null}</View>{event.changedThisLoop ? <Text style={styles.changed}>CHANGED THIS LOOP</Text> : null}</View></View>)}</View></View>;
}

function EvidenceView({ campaign, busy, onPin }: { campaign: StoryCampaign; busy: string; onPin: (id: string, pinned: boolean) => void }) {
  const evidence = campaign.evidence;
  const groups = [['critical', 'Critical evidence'], ['character_truth', 'Character truths'], ['atmosphere', 'World details']] as const;
  return <View style={styles.stack}><View><Text style={styles.pageTitle}>Investigation</Text><Text style={styles.pageCopy}>Follow evolving lines of inquiry, then review only the evidence you have actually earned.</Text></View><InvestigationTracks tracks={campaign.deductions} />{groups.map(([key, label]) => <Section key={key} title={label} subtitle={`${evidence.filter((item) => item.category === key).length} discovered`}><View style={styles.stack}>{evidence.filter((item) => item.category === key).map((item) => <View key={item.id} style={[styles.evidenceCard, item.discoveredThisLoop && styles.evidenceFresh, item.pinned && storyStyles.pinnedCard]}><View style={styles.evidenceHeader}><View style={styles.flexOne}><Text style={styles.evidenceTitle}>{item.title}</Text>{item.discoveredThisLoop ? <Text style={styles.newLead}>NEW</Text> : null}</View><PinButton label="evidence" pinned={item.pinned} disabled={Boolean(busy)} onPress={() => onPin(item.id, item.pinned)} /></View><Text style={styles.actionBody}>{item.description}</Text><Text style={storyStyles.evidenceSource}>Source · {item.source}</Text>{item.trackId ? <Text style={storyStyles.evidenceRelation}>Inquiry · {item.trackId.replaceAll('-', ' ')}</Text> : null}{item.relatedCharacterIds.length || item.relatedLocationIds.length ? <Text style={storyStyles.evidenceRelation}>Connected to {[...item.relatedCharacterIds, ...item.relatedLocationIds].map((value) => value.replaceAll('-', ' ')).join(' · ')}</Text> : null}{item.corroborates?.length ? <Text style={storyStyles.evidenceRelation}>Corroborates {item.corroborates.map((value) => value.replaceAll('-', ' ')).join(', ')}</Text> : null}{item.contradicts?.length ? <Text style={storyStyles.evidenceRelation}>Challenges {item.contradicts.map((value) => value.replaceAll('-', ' ')).join(', ')}</Text> : null}{item.presentedTo.length ? <Text style={styles.presented}>Shown to {item.presentedTo.join(', ')}</Text> : null}</View>)}</View></Section>)}</View>;
}

function InvestigationTracks({ tracks }: { tracks: StoryCampaign['deductions'] }) {
  return <View style={styles.trackGrid}>{tracks.map((track) => <View key={track.id} style={[styles.trackCard, track.status === 'active' && styles.trackCardActive, track.completed && styles.trackCardComplete]}>
    <View style={styles.trackHeading}><Text style={styles.trackState}>{track.completed ? 'RESOLVED' : track.status === 'active' ? 'ACTIVE THREAD' : 'UNOPENED'}</Text><Text style={styles.trackCount}>{track.discoveredCount}/{track.requiredCount}</Text></View>
    <Text style={styles.trackTitle}>{track.title}</Text><Text style={styles.trackQuestion}>{track.question}</Text><Text style={styles.trackDescription}>{track.description}</Text>
    <View style={styles.trackProgress}><View style={[styles.trackProgressFill, { width: `${Math.min(100, (track.discoveredCount / Math.max(1, track.requiredCount)) * 100)}%` }]} /></View>
  </View>)}</View>;
}

function PeopleView({ campaign, busy, onTalk, onPin }: { campaign: StoryCampaign; busy: string; onTalk: (id: string) => void; onPin: (id: string, pinned: boolean) => void }) {
  const locations = new Map(campaign.locations.map((location) => [location.id, location.name]));
  return <View style={styles.stack}><View><Text style={styles.pageTitle}>Characters</Text><Text style={styles.pageCopy}>People remember only this loop. You remember what each version of them revealed.</Text></View><View style={styles.dossierGrid}>{campaign.dossiers.map((person) => {
    const present = campaign.presentCharacters.some((item) => item.id === person.id);
    return <View key={person.id} style={[styles.dossier, person.pinned && storyStyles.pinnedCard]}><StoryPortrait person={person} size={72} /><View style={styles.flexOne}><View style={storyStyles.itemHeading}><View style={styles.flexOne}><Text style={styles.personName}>{person.name}</Text><Text style={styles.role}>{person.role}</Text></View><PinButton label={`${person.name} dossier`} pinned={Boolean(person.pinned)} disabled={Boolean(busy)} onPress={() => onPin(person.id, Boolean(person.pinned))} /></View>{person.currentLocationId ? <Text style={storyStyles.knownAt}>{present ? 'Here now' : 'Expected at'} {locations.get(person.currentLocationId) ?? person.currentLocationId}</Text> : null}<Text style={styles.dossierBody} numberOfLines={4}>{person.biography}</Text><View style={styles.meters}><Meter label="Trust" value={person.trust} color="#65D6BE" /><Meter label="Suspicion" value={person.suspicion} color="#D27B9E" /></View>{present ? <Pressable accessibilityRole="button" accessibilityLabel={`Talk to ${person.name}`} onPress={() => onTalk(person.id)} style={storyStyles.talkButton}><MessageCircle size={14} color="#9BE9DA" /><Text style={storyStyles.talkButtonText}>Talk now</Text></Pressable> : null}</View></View>;
  })}</View></View>;
}

function RecapView({ campaign }: { campaign: StoryCampaign }) {
  return <View style={styles.stack}><View><Text style={styles.pageTitle}>Campaign</Text><Text style={styles.pageCopy}>A clear record of what persisted when midnight took the rest.</Text></View><View style={styles.stats}><Stat value={campaign.loop + 1} label="Current loop" /><Stat value={`${campaign.factsDiscovered}/${campaign.factsTotal}`} label="Facts" /><Stat value={`${campaign.deductionsCompleted}/${campaign.deductionsTotal}`} label="Deductions" /><Stat value={`${campaign.endingsDiscovered}/${campaign.endingsTotal}`} label="Endings" /></View>{campaign.loopHistory.length ? <View style={styles.stack}>{[...campaign.loopHistory].reverse().map((item, index) => <View key={index} style={styles.recapCard}><Text style={styles.eyebrow}>LOOP {String(item.loop ?? campaign.loop - index).padStart(2, '0')}</Text><Text style={styles.actionTitle}>{String(item.recap ?? 'The bell rang, and the night began again.')}</Text><Text style={styles.actionBody}>{Array.isArray(item.factsDiscovered) ? `${item.factsDiscovered.length} facts discovered · ` : ''}{Array.isArray(item.eventsWitnessed) ? `${item.eventsWitnessed.length} events witnessed` : ''}</Text></View>)}</View> : <View style={styles.quiet}><Text style={styles.quietTitle}>No completed loops yet.</Text><Text style={styles.muted}>At midnight, your persistent discoveries will be summarized here.</Text></View>}</View>;
}

function SettingsView({ campaign, busy, onChange, onRestart, onAbandon }: { campaign: StoryCampaign; busy: string; onChange: (settings: StoryCampaign['settings']) => void; onRestart: () => void; onAbandon: () => void }) {
  const settings = campaign.settings;
  return <View style={styles.stack}><View><Text style={styles.pageTitle}>Story settings</Text><Text style={styles.pageCopy}>These controls affect this campaign only. They never change your companion chats.</Text></View><Setting title="Story guidance" options={['subtle', 'balanced', 'direct']} selected={settings.guidance ?? 'balanced'} onSelect={(value) => onChange({ ...settings, guidance: value as 'subtle' | 'balanced' | 'direct' })} /><Setting title="Text size" options={['small', 'medium', 'large']} selected={settings.textSize ?? 'medium'} onSelect={(value) => onChange({ ...settings, textSize: value as 'small' | 'medium' | 'large' })} /><Setting title="Sound" options={['on', 'off']} selected={settings.sound === false ? 'off' : 'on'} onSelect={(value) => onChange({ ...settings, sound: value === 'on' })} /><Setting title="Motion" options={['on', 'off']} selected={settings.motion === false ? 'off' : 'on'} onSelect={(value) => onChange({ ...settings, motion: value === 'on' })} /><Setting title="Story tone" options={['standard', 'mature']} selected={settings.content ?? 'standard'} onSelect={(value) => onChange({ ...settings, content: value as 'standard' | 'mature' })} />{busy === 'settings' ? <ActivityIndicator color="#67D7C1" /> : null}<View style={styles.setting}><Text style={styles.settingTitle}>Campaign</Text><Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => router.replace('/stories' as never)} style={styles.campaignButton}><Text style={styles.campaignButtonText}>Pause and return to archive</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(busy) }} disabled={Boolean(busy)} onPress={onRestart} style={styles.campaignButton}><Text style={styles.campaignButtonText}>Restart from the first loop</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(busy) }} disabled={Boolean(busy)} onPress={onAbandon} style={[styles.campaignButton, styles.campaignDanger]}><Text style={styles.campaignDangerText}>End this campaign</Text></Pressable></View></View>;
}

function ConversationPanel({ campaign, person, stream, busy, compact = false, onSelect, onStream, onCampaign, onBusy, onError, onStoryAction, onFollow, onAbsence, onCheckMap }: {
  campaign: StoryCampaign; person?: StoryPerson; stream: string; busy: string; compact?: boolean;
  onClose?: () => void; onSelect: (id: string) => void; onStream: (text: string) => void;
  onCampaign: (campaign: StoryCampaign) => void; onBusy: (key: string) => void; onError: (message: string) => void;
  onStoryAction: (action: StoryAction) => void;
  onFollow: (characterId: string) => void;
  onAbsence: (characterId: string, choice: 'wait' | 'leave_note' | 'ask_nearby') => void;
  onCheckMap: () => void;
}) {
  const [text, setText] = useState('');
  const [approachId, setApproachId] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const messageListRef = useRef<ScrollView>(null);
  const visibleMessages = useMemo(() => visibleStoryMessages(campaign, person?.id), [campaign, person?.id]);
  const peopleById = useMemo(() => new Map([...campaign.dossiers, ...campaign.presentCharacters, ...campaign.othersNearby].map((item) => [item.id, item])), [campaign]);
  const selectedApproach = person?.approaches?.find((item) => item.id === approachId);
  const selectedEvidence = campaign.evidence.find((item) => item.id === evidenceId);
  const messageScale = campaign.settings.textSize === 'small' ? { fontSize: 14, lineHeight: 20 } : campaign.settings.textSize === 'large' ? { fontSize: 18, lineHeight: 26 } : { fontSize: 16, lineHeight: 23 };

  const send = async (override?: string, nextApproach?: string) => {
    const message = (override ?? text).trim();
    if (!person || !message || busy) return;
    setText(''); onStream(''); onBusy('dialogue');
    let accumulated = '';
    try {
      const result = await sendStoryDialogue({
        campaignId: campaign.id, expectedVersion: campaign.version, characterId: person.id, message,
        ...(nextApproach || approachId ? { approachId: nextApproach || approachId } : {}),
        ...(evidenceId ? { evidenceId } : {}), clientMessageId: createClientRequestId(),
      }, (token) => { accumulated += token; onStream(accumulated); });
      onCampaign(result.campaign); setApproachId(''); setEvidenceId(''); setEvidenceOpen(false); onStream('');
    } catch (caught) {
      setText(message);
      onError(caught instanceof Error ? caught.message : 'The conversation could not continue.');
    } finally { onBusy(''); }
  };

  if (!person) return <View style={[styles.conversation, compact && styles.conversationCompact]}><Text style={styles.quietTitle}>No one is here to question.</Text></View>;
  const personPresent = storyPersonIsPresent(campaign, person.id);
  const destination = person.currentLocationId ? campaign.locations.find((location) => location.id === person.currentLocationId) : null;
  const personLocation = destination?.name ?? (personPresent ? campaign.currentLocation.name : 'Location unknown');
  const canFollow = Boolean(person.followPlan && destination?.unlocked && !destination.current);
  const inputDisabled = Boolean(busy) || !personPresent;
  const tabPeople = [...campaign.presentCharacters, ...campaign.othersNearby].filter((item, index, rows) => rows.findIndex((other) => other.id === item.id) === index);
  if (!tabPeople.some((item) => item.id === person.id)) tabPeople.unshift(person);
  return <View style={[styles.conversation, compact && styles.conversationCompact]}>
    <View style={styles.conversationHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${person.name} story details`} onPress={() => setProfileOpen(true)} style={({ pressed }) => [styles.storyCharacterPortraitTrigger, pressed && styles.pressed]}>
        <StoryPortrait person={person} size={52} />
      </Pressable>
      <View style={styles.conversationIdentity}>
        <View style={styles.conversationNameLine}>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${person.name} story details`} onPress={() => setProfileOpen(true)} style={({ pressed }) => [styles.storyCharacterNameTrigger, pressed && styles.pressed]}><Text numberOfLines={1} style={styles.conversationName}>{person.name}</Text></Pressable>
          {compact && tabPeople.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel={`Choose from ${tabPeople.length} people here`} onPress={() => setPeopleOpen(true)} hitSlop={8} style={({ pressed }) => [styles.inlinePeopleButton, pressed && styles.pressed]}><Text style={styles.inlinePeopleLabel}>PEOPLE HERE · {tabPeople.length}</Text><ChevronDown size={15} color="#91E5D5" /></Pressable> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${person.name} story details`} onPress={() => setProfileOpen(true)} style={({ pressed }) => [styles.storyCharacterHintTrigger, pressed && styles.pressed]}><Text style={styles.storyCharacterHint}>View story details</Text></Pressable>
      </View>
    </View>
    <StoryCharacterPopup visible={profileOpen} person={person} present={personPresent} locationName={personLocation} onClose={() => setProfileOpen(false)} />
    {tabPeople.length > 1 && !compact ? <View style={styles.personTabs}>{tabPeople.map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: item.id === person.id }} key={item.id} onPress={() => onSelect(item.id)} style={[styles.personTab, item.id === person.id && styles.personTabActive]}><StoryPortrait person={item} size={26} /><Text style={[styles.personTabText, item.id === person.id && styles.personTabTextActive]}>{item.name.split(' ')[0]}</Text></Pressable>)}</View> : null}
    {compact ? <StoryPeopleChooser visible={peopleOpen} title="Choose who to talk to" present={campaign.presentCharacters} nearby={campaign.othersNearby} selectedId={person.id} onClose={() => setPeopleOpen(false)} onSelect={(id) => { setPeopleOpen(false); onSelect(id); }} /> : null}
    <ScrollView ref={messageListRef} style={styles.messages} contentContainerStyle={styles.messageContent} keyboardShouldPersistTaps="handled" onContentSizeChange={() => messageListRef.current?.scrollToEnd({ animated: true })}>
      {visibleMessages.map((message) => {
        const system = message.role === 'system';
        const speaker = message.character_slug ? peopleById.get(message.character_slug) : null;
        const target = typeof message.metadata?.targetCharacterId === 'string' ? peopleById.get(message.metadata.targetCharacterId) : null;
        const evidence = typeof message.metadata?.evidenceId === 'string' ? campaign.evidence.find((item) => item.id === message.metadata.evidenceId) : null;
        const stageDirection = typeof message.metadata?.stageDirection === 'string' ? message.metadata.stageDirection : '';
        const presenceTransition = system && message.metadata?.kind === 'presence_transition';
        const transitionType = message.metadata?.transitionType === 'departed' || message.metadata?.transitionType === 'arrived' ? message.metadata.transitionType : null;
        const transitionCharacter = typeof message.metadata?.characterId === 'string' ? peopleById.get(message.metadata.characterId) : null;
        const transitionDestinationId = typeof message.metadata?.destinationLocationId === 'string' ? message.metadata.destinationLocationId : null;
        const transitionDestination = transitionDestinationId ? campaign.locations.find((location) => location.id === transitionDestinationId) : null;
        const transitionCanFollow = Boolean(transitionType === 'departed' && transitionCharacter?.followPlan && transitionDestination?.unlocked && !transitionDestination.current);
        const proposedLeadId = typeof message.metadata?.proposedLeadId === 'string' ? message.metadata.proposedLeadId : '';
        const proposedLead = proposedLeadId && speaker ? campaign.presentCharacters.find((item) => item.id === speaker.id)?.approaches?.find((item) => item.id === proposedLeadId) : null;
        const proposedActionIds = Array.isArray(message.metadata?.proposedActionIds) ? message.metadata.proposedActionIds.filter((id): id is string => typeof id === 'string') : [];
        const proposedActions = campaign.interactions.filter((item) => proposedActionIds.includes(item.id));
        if (presenceTransition) return <View key={message.id} style={styles.presenceMarker}>
          <Text style={styles.presenceMarkerText}>— {message.content} · {formatMinute(message.story_minute)} —</Text>
          {transitionCanFollow && transitionCharacter ? <Pressable accessibilityRole="button" accessibilityLabel={`Follow ${transitionCharacter.name}`} disabled={Boolean(busy)} onPress={() => onFollow(transitionCharacter.id)} style={styles.presenceFollow}><Text style={styles.presenceFollowText}>Follow</Text><ChevronRight size={14} color="#8CE5D3" /></Pressable> : null}
        </View>;
        return <View key={message.id} style={[styles.message, message.role === 'user' ? styles.userMessage : system ? styles.systemMessage : styles.characterMessage]}>
          {!system && message.role === 'character' ? <View style={styles.messageSpeakerRow}>{speaker ? <StoryPortrait person={speaker} size={22} /> : null}<Text style={styles.messageSpeaker}>{speaker?.name.split(' ')[0] ?? 'Unknown'}</Text>{message.metadata?.reactive ? <Text style={styles.interjectionLabel}>INTERJECTS</Text> : null}</View> : null}
          {message.role === 'user' && target ? <Text style={styles.userTarget}>TO {(target.name.split(' ')[0] ?? target.name).toUpperCase()}</Text> : null}
          {evidence ? <View style={styles.messageEvidence}><BookOpenCheck size={14} color="#E2C575" /><View style={styles.flexOne}><Text style={styles.messageEvidenceLabel}>EVIDENCE PRESENTED</Text><Text style={styles.messageEvidenceTitle} numberOfLines={2}>{evidence.title}</Text></View></View> : null}
          {stageDirection ? <Text style={styles.stageDirection}>{stageDirection}</Text> : null}
          <Text style={[styles.messageText, messageScale, system && styles.systemText]}>{message.content}</Text>
          {proposedLead || proposedActions.length ? <View style={styles.messageLeadActions}>
            {proposedLead && speaker ? <Pressable accessibilityRole="button" accessibilityLabel={`${proposedLead.label} with ${speaker.name}`} disabled={Boolean(busy)} onPress={() => { onSelect(speaker.id); setApproachId(proposedLead.id); setText(proposedLead.label); }} style={styles.messageLeadButton}><MessageCircle size={14} color="#95E8D8" /><Text style={styles.messageLeadButtonText}>{proposedLead.label}</Text><ChevronRight size={14} color="#95E8D8" /></Pressable> : null}
            {proposedActions.map((action) => <Pressable key={action.id} accessibilityRole="button" accessibilityLabel={action.title} disabled={Boolean(busy)} onPress={() => onStoryAction({ type: 'investigate', interactionId: action.id })} style={styles.messageLeadButton}><Search size={14} color="#95E8D8" /><Text style={styles.messageLeadButtonText}>{action.title}</Text><ChevronRight size={14} color="#95E8D8" /></Pressable>)}
          </View> : null}
          <Text style={styles.messageTime}>{formatMinute(message.story_minute)}</Text>
        </View>;
      })}
      {stream ? <View style={[styles.message, styles.characterMessage]}><Text style={styles.messageSpeaker}>{person.name.split(' ')[0]}</Text><Text style={[styles.messageText, messageScale]}>{stream}</Text></View> : null}
    </ScrollView>
    {personPresent && person.approaches?.length ? <View style={styles.responseArea}><Text style={styles.responseLabel}>POSSIBLE APPROACHES · EDIT BEFORE SENDING</Text><View style={styles.approaches}>{person.approaches.map((approach) => <Pressable key={approach.id} disabled={Boolean(busy)} onPress={() => { setApproachId(approach.id); setText(approach.label); }} style={({ pressed }) => [styles.approach, approach.id === approachId && styles.approachActive, pressed && styles.pressed]}><Text style={styles.approachText}>{approach.label}</Text><Text style={styles.approachTime}>+{approach.timeCost}m</Text></Pressable>)}</View></View> : null}
    {personPresent && campaign.evidence.length && evidenceOpen ? <ScrollView horizontal style={styles.evidencePickerScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.evidencePicker}>{campaign.evidence.slice(-12).map((evidence) => <Pressable key={evidence.id} onPress={() => { setEvidenceId(evidence.id === evidenceId ? '' : evidence.id); setEvidenceOpen(false); }} style={[styles.evidencePick, evidence.id === evidenceId && styles.evidencePickActive]}><Text style={styles.evidencePickText} numberOfLines={1}>{evidence.title}</Text></Pressable>)}</ScrollView> : null}
    {!personPresent ? <View style={styles.absentComposer}>
      <Text style={styles.absentComposerTitle}>{person.name.split(' ')[0]} isn’t here now.</Text>
      <Text style={styles.absentComposerText}>{destination ? `${person.name.split(' ')[0]} was headed to ${destination.name}.` : 'Their current destination is not known.'}</Text>
      {canFollow && person.followPlan ? <View style={styles.followForecast}><Text style={styles.followForecastText}>{person.followPlan.travelMinutes} min · arrive {person.followPlan.arrivalTime}</Text><Text style={[styles.followConfidence, person.followPlan.mayMoveBeforeArrival && styles.followUncertain]}>{person.followPlan.catchable ? 'You should catch them' : 'They may move before you arrive'}</Text></View> : null}
      <View style={styles.absentActions}>
        {canFollow ? <Pressable accessibilityRole="button" accessibilityLabel={`Follow ${person.name}`} disabled={Boolean(busy)} onPress={() => onFollow(person.id)} style={styles.absentFollow}><Text style={styles.absentFollowText}>Follow</Text><ChevronRight size={16} color="#08120F" /></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Wait here five minutes" disabled={Boolean(busy)} onPress={() => onAbsence(person.id, 'wait')} style={styles.absentSecondary}><Text style={styles.absentSecondaryText}>Wait here</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Leave ${person.name} a note`} disabled={Boolean(busy)} onPress={() => onAbsence(person.id, 'leave_note')} style={styles.absentSecondary}><Text style={styles.absentSecondaryText}>Leave a note</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ask nearby about ${person.name}`} disabled={Boolean(busy)} onPress={() => onAbsence(person.id, 'ask_nearby')} style={styles.absentSecondary}><Text style={styles.absentSecondaryText}>Ask nearby</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Check the story map" onPress={onCheckMap} style={styles.absentSecondary}><Text style={styles.absentSecondaryText}>Check map</Text></Pressable>
      </View>
    </View> : <View style={styles.composerWrap}>
      {selectedApproach ? <View style={styles.composerContext}><Text style={styles.composerContextLabel}>APPROACH</Text><Text style={styles.composerContextText}>{selectedApproach.label}</Text><Pressable accessibilityLabel="Clear selected approach" onPress={() => setApproachId('')}><X size={16} color="#AEA5B2" /></Pressable></View> : null}
      {selectedEvidence ? <View style={styles.evidenceAttachment}><BookOpenCheck size={18} color="#E2C575" /><View style={styles.flexOne}><Text style={styles.composerContextLabel}>PRESENTING EVIDENCE</Text><Text style={styles.evidenceAttachmentTitle}>{selectedEvidence.title}</Text><Text style={styles.evidenceAttachmentSource} numberOfLines={1}>{selectedEvidence.source}</Text></View><Pressable accessibilityLabel="Remove evidence" onPress={() => setEvidenceId('')}><X size={17} color="#AEA5B2" /></Pressable></View> : null}
      <View style={styles.composer}>
      {campaign.evidence.length ? <Pressable accessibilityRole="button" accessibilityLabel="Attach evidence" onPress={() => setEvidenceOpen((value) => !value)} style={[styles.attachEvidence, evidenceId && styles.attachEvidenceActive]}><BookOpenCheck size={19} color={evidenceId ? '#11130E' : '#D9C27F'} /></Pressable> : null}
      <TextInput accessibilityLabel={`Question ${person.name}`} value={text} onChangeText={setText} onKeyPress={(event) => {
        const nativeEvent = event.nativeEvent as typeof event.nativeEvent & { shiftKey?: boolean; isComposing?: boolean };
        const intent = { platform: Platform.OS, key: nativeEvent.key, shiftKey: nativeEvent.shiftKey, isComposing: nativeEvent.isComposing, hasContent: Boolean(text.trim()), disabled: inputDisabled };
        if (!shouldConsumeComposerEnter(intent)) return;
        event.preventDefault(); if (shouldSendComposerOnEnter(intent)) void send();
      }} placeholder={`Ask ${person.name}…`} placeholderTextColor="#77717D" editable={!inputDisabled} multiline style={styles.input} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Send message to ${person.name}`} accessibilityState={{ disabled: !text.trim() || inputDisabled }} disabled={!text.trim() || inputDisabled} onPress={() => void send()} style={[styles.send, (!text.trim() || inputDisabled) && styles.sendDisabled]}>{busy === 'dialogue' ? <ActivityIndicator color="#07110F" size="small" /> : <Send size={19} color="#07110F" />}</Pressable>
    </View></View>}
  </View>;
}

function MidnightPanel({ campaign, busy, onReset }: { campaign: StoryCampaign; busy: string; onReset: () => void }) {
  return <View style={styles.midnight}><RotateCcw size={28} color="#E0B768" /><Text style={styles.midnightTitle}>Midnight found you.</Text><Text style={styles.midnightText}>The town will forget this version of the night. Your {campaign.factsDiscovered} discovered facts and completed deductions remain.</Text><Pressable disabled={Boolean(busy)} onPress={onReset} style={styles.goldButton}><Text style={styles.goldButtonText}>{busy ? 'Resetting…' : 'Begin the next loop'}</Text></Pressable></View>;
}

function EndingPanel({ campaign }: { campaign: StoryCampaign }) {
  return <View style={styles.midnight}><Sparkles size={28} color="#67D7C1" /><Text style={styles.eyebrow}>ENDING DISCOVERED</Text><Text style={styles.midnightTitle}>{campaign.completedEnding?.title}</Text><Text style={styles.midnightText}>{campaign.completedEnding?.description}</Text>{campaign.completedEnding?.epilogue ? <Text style={storyStyles.epilogue}>{campaign.completedEnding.epilogue}</Text> : null}<View style={styles.stats}><Stat value={campaign.loop + 1} label="Loops used" /><Stat value={`${campaign.factsDiscovered}/${campaign.factsTotal}`} label="Facts found" /><Stat value={`${campaign.deductionsCompleted}/${campaign.deductionsTotal}`} label="Deductions" /></View>{campaign.majorChoices.length ? <View style={storyStyles.endingSection}><Text style={styles.settingTitle}>Choices that shaped this ending</Text>{campaign.majorChoices.map((choice) => <Text key={choice} style={styles.actionBody}>• {choice}</Text>)}</View> : null}<View style={storyStyles.endingSection}><Text style={styles.settingTitle}>Ending archive</Text><View style={storyStyles.endingArchive}>{campaign.endingArchive.map((ending) => <View key={ending.id} style={[storyStyles.endingSilhouette, ending.discovered && storyStyles.endingDiscovered]}><Text style={[storyStyles.endingSilhouetteText, ending.discovered && storyStyles.endingDiscoveredText]}>{ending.discovered ? ending.title : 'Undiscovered'}</Text></View>)}</View></View><Pressable accessibilityRole="button" onPress={() => router.replace('/stories' as never)} style={styles.goldButton}><Text style={styles.goldButtonText}>Return to the archive</Text></Pressable></View>;
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) { return <View style={styles.section}><View><Text style={styles.sectionTitle}>{title}</Text>{subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}</View>{children}</View>; }
function StoryPortrait({ person, size }: { person: { name: string; portraitSlug: string }; size: number }) { const source = characterAssets[person.portraitSlug]; return <View style={[styles.portraitFallback, { width: size, height: size, borderRadius: size / 2 }]}>{source ? <Image source={source} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" contentPosition="top" /> : <Text style={[styles.portraitInitial, { fontSize: size * 0.38 }]}>{person.name[0]}</Text>}</View>; }
function Meter({ label, value, color }: { label: string; value: number; color: string }) { return <View style={styles.meter}><View style={styles.meterLabel}><Text style={styles.meterText}>{label}</Text><Text style={styles.meterValue}>{value}</Text></View><View style={styles.meterTrack}><View style={[styles.meterFill, { width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }]} /></View></View>; }
function Stat({ value, label }: { value: string | number; label: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function Setting({ title, options, selected, onSelect }: { title: string; options: string[]; selected: string; onSelect: (value: string) => void }) { return <View style={styles.setting}><Text style={styles.settingTitle}>{title}</Text><View style={styles.settingOptions}>{options.map((option) => <Pressable key={option} onPress={() => onSelect(option)} style={[styles.settingOption, selected === option && styles.settingOptionActive]}><Text style={[styles.settingOptionText, selected === option && styles.settingOptionTextActive]}>{option[0]!.toUpperCase() + option.slice(1)}</Text></Pressable>)}</View></View>; }
function PinButton({ label, pinned, disabled, onPress }: { label: string; pinned: boolean; disabled: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityLabel={`${pinned ? 'Unpin' : 'Pin'} ${label}`} accessibilityState={{ selected: pinned, disabled }} disabled={disabled} onPress={onPress} style={[storyStyles.pinButton, pinned && storyStyles.pinButtonActive]}><Pin size={15} color={pinned ? '#08120F' : '#A8A1AC'} fill={pinned ? '#67D7C1' : 'transparent'} /></Pressable>; }
function formatMinute(minute: number) { const hour = Math.floor(minute / 60) % 24; const mins = minute % 60; const suffix = hour >= 12 ? 'PM' : 'AM'; const display = hour % 12 || 12; return `${display}:${String(mins).padStart(2, '0')} ${suffix}`; }

const storyStyles = StyleSheet.create({
  proactiveBeat: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(103,215,193,.35)', backgroundColor: 'rgba(30,92,83,.13)', padding: 14 },
  proactiveBeatPressure: { borderColor: 'rgba(210,123,158,.38)', backgroundColor: 'rgba(96,37,61,.13)' },
  proactiveTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 3, marginBottom: 3 },
  itemHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  pinnedHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  pinnedCard: { borderColor: 'rgba(224,183,104,.46)', backgroundColor: 'rgba(224,183,104,.055)' },
  evidenceSource: { color: '#C6B77C', fontSize: 11, marginTop: 2 },
  evidenceRelation: { color: '#958E99', fontSize: 11, textTransform: 'capitalize' },
  knownAt: { color: '#6DD6C1', fontSize: 11, marginTop: 5 },
  talkButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: 'rgba(103,215,193,.1)', paddingHorizontal: 11, paddingVertical: 8, marginTop: 10, minHeight: 40 },
  talkButtonText: { color: '#9BE9DA', fontSize: 11, fontWeight: '900' },
  pinButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', backgroundColor: 'rgba(255,255,255,.04)' },
  pinButtonActive: { backgroundColor: '#67D7C1', borderColor: '#67D7C1' },
  epilogue: { color: '#D5CED7', fontFamily: typography.display, fontSize: 17, lineHeight: 26, textAlign: 'center', maxWidth: 720, marginVertical: 8 },
  endingSection: { width: '100%', maxWidth: 720, gap: 7, marginTop: 8 },
  endingArchive: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  endingSilhouette: { flex: 1, minWidth: 130, minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', backgroundColor: 'rgba(255,255,255,.025)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  endingDiscovered: { borderColor: 'rgba(103,215,193,.32)', backgroundColor: 'rgba(103,215,193,.07)' },
  endingSilhouetteText: { color: '#68626D', fontSize: 10, fontWeight: '800' },
  endingDiscoveredText: { color: '#9BE9DA' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05070D', minHeight: 0 },
  shell: { flex: 1, width: '100%', maxWidth: 1600, alignSelf: 'center', minHeight: 0 },
  shellDesktop: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12, gap: 12 },
  loading: { flex: 1, backgroundColor: '#060810', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 30 },
  topbar: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(185,145,82,.18)', backgroundColor: 'rgba(8,9,16,.98)' },
  topbarDesktop: { minHeight: 84, borderWidth: 1, borderColor: 'rgba(185,145,82,.18)', borderRadius: 18, paddingHorizontal: 18 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,.07)' },
  topCopy: { flex: 1, minWidth: 130 },
  topTitle: { fontFamily: typography.display, color: colors.text, fontSize: 22 },
  topMeta: { color: '#A9A2AD', fontSize: 12, marginTop: 3 },
  headerStats: { alignItems: 'center', gap: 7, paddingVertical: 6 },
  headerStat: { minHeight: 42, minWidth: 76, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', backgroundColor: 'rgba(255,255,255,.035)', paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  headerStatWarning: { borderColor: 'rgba(224,183,104,.28)', backgroundColor: 'rgba(224,183,104,.065)' },
  headerStatLabel: { color: '#817B87', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  headerStatValue: { color: '#D8D1DA', fontSize: 12, fontWeight: '900', marginTop: 2 },
  headerStatWarningText: { color: '#EED69A' },
  workspace: { flex: 1, minHeight: 0 },
  workspaceDesktop: { flexDirection: 'row', gap: 24 },
  main: { flex: 1, minWidth: 0 },
  mainContent: { padding: 16, paddingBottom: 18 },
  mainContentDesktop: { padding: 8, paddingBottom: 40 },
  flexOne: { flex: 1, minWidth: 0 },
  stack: { gap: 20 },
  sceneHero: { minHeight: 420, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(185,145,82,.28)', backgroundColor: '#071015' },
  sceneHeroCompact: { minHeight: 340 },
  sceneTint: { backgroundColor: 'rgba(2,7,11,.20)' },
  sceneLowerShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%', backgroundColor: 'rgba(3,7,12,.42)' },
  sceneBottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%', backgroundColor: 'rgba(3,7,12,.72)' },
  sceneCopy: { marginTop: 'auto', padding: 26, gap: 6, maxWidth: 760 },
  sceneKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sceneTime: { color: '#E3C77E', fontSize: 12, fontWeight: '900' },
  eyebrow: { color: '#78DDD0', fontWeight: '900', fontSize: 11, letterSpacing: 1.5 },
  sceneTitle: { fontFamily: typography.display, color: '#F5E6C8', fontSize: 36, lineHeight: 42 },
  sceneSubtitle: { color: '#E4D6DF', fontSize: 16, fontWeight: '700' },
  bodyText: { color: '#C0BAC4', fontSize: 15, lineHeight: 22, maxWidth: 700 },
  section: { gap: 13 },
  sectionTitle: { fontFamily: typography.display, color: colors.text, fontSize: 24 },
  sectionSubtitle: { color: '#9A949F', fontSize: 12, marginTop: 2 },
  peopleStrip: { gap: 10, paddingRight: 4 },
  personChip: { width: 250, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 78, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,.09)', backgroundColor: 'rgba(18,17,27,.86)', padding: 11 },
  ambientChip: { width: 210, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,.06)', backgroundColor: 'rgba(15,14,22,.58)', paddingHorizontal: 10, paddingVertical: 8 },
  personChipActive: { borderColor: 'rgba(103,215,193,.48)', backgroundColor: 'rgba(103,215,193,.08)' },
  personChipCopy: { flex: 1, minWidth: 0 },
  chatIndicator: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(103,215,193,.1)', alignItems: 'center', justifyContent: 'center' },
  portraitFallback: { backgroundColor: '#262131', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  portraitInitial: { fontFamily: typography.display, color: '#D5C5DC' },
  personName: { color: colors.text, fontWeight: '800', fontSize: 15 },
  personActivity: { color: '#A39DA8', fontSize: 12, lineHeight: 16, marginTop: 3 },
  leavingSoon: { color: '#E7C77D', fontSize: 10, lineHeight: 14, fontWeight: '900', marginTop: 3 },
  compactPeopleButton: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(103,215,193,.20)', backgroundColor: 'rgba(16,23,30,.90)', paddingHorizontal: 12, paddingVertical: 9 },
  compactPeopleAvatars: { minWidth: 40, flexDirection: 'row', alignItems: 'center', paddingLeft: 1 },
  compactPeopleAvatar: { borderRadius: 19, borderWidth: 2, borderColor: '#111823', backgroundColor: '#111823' },
  compactPeopleAvatarOverlap: { marginLeft: -12 },
  compactPeopleKicker: { color: '#74D8C6', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  compactPeopleLabel: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 2 },
  peopleChooserBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1,4,8,.68)', paddingHorizontal: 12, paddingBottom: 18 },
  peopleChooserPosition: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  peopleChooserGlass: { maxHeight: '72%', borderRadius: 25, borderColor: 'rgba(103,215,193,.20)', backgroundColor: 'rgba(9,12,20,.93)', padding: 16, shadowColor: '#000', shadowOpacity: .54, shadowRadius: 28, shadowOffset: { width: 0, height: 14 } },
  peopleChooserHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
  peopleChooserKicker: { color: '#74D8C6', fontSize: 8, fontWeight: '900', letterSpacing: 1.25 },
  peopleChooserTitle: { fontFamily: typography.display, color: colors.text, fontSize: 23, marginTop: 2 },
  peopleChooserClose: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' },
  peopleChooserScroll: { flexGrow: 0 },
  peopleChooserContent: { gap: 8, paddingBottom: 3 },
  peopleChooserSection: { color: '#817B87', fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 5, marginBottom: 1 },
  peopleChooserRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,.075)', backgroundColor: 'rgba(255,255,255,.035)', paddingHorizontal: 10, paddingVertical: 8 },
  peopleChooserRowActive: { borderColor: 'rgba(103,215,193,.40)', backgroundColor: 'rgba(103,215,193,.10)' },
  peopleChooserName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  peopleChooserActivity: { color: '#9D96A1', fontSize: 11, lineHeight: 15, marginTop: 2 },
  peopleChooserStatus: { color: '#8FE5D5', fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  peopleChooserStatusNearby: { color: '#A49DAB' },
  arrivalOpportunity: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(103,215,193,.3)', backgroundColor: 'rgba(26,91,80,.11)', paddingHorizontal: 13, paddingVertical: 11 },
  arrivalTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 2 },
  quiet: { borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.13)', padding: 18, gap: 5 },
  quietTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  muted: { color: '#A49EA9', fontSize: 14, lineHeight: 20 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { minWidth: 260, flexBasis: '47%', flexGrow: 1, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', backgroundColor: 'rgba(15,15,24,.9)', padding: 17, gap: 8 },
  actionCardSingle: { flexBasis: '100%', minWidth: 0 },
  actionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(178,138,227,.08)' },
  timeCost: { color: '#E3C77E', fontSize: 12, fontWeight: '900' },
  actionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  actionBody: { color: '#B2ACB7', fontSize: 13, lineHeight: 19 },
  outcomeHint: { color: '#837C88', fontWeight: '900', fontSize: 9, letterSpacing: 1, marginTop: 4 },
  newLead: { color: '#6DD6C1' },
  endingChoice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(224,183,104,.28)', backgroundColor: 'rgba(224,183,104,.06)', padding: 16 },
  visualHero: { height: 430, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)' },
  visualShade: { backgroundColor: 'rgba(6,8,14,.42)' },
  visualCaption: { marginTop: 'auto', padding: 22, gap: 5 },
  visualTitle: { fontFamily: typography.display, color: colors.text, fontSize: 28 },
  mapView: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: 10 },
  mapCanvas: { width: '100%', aspectRatio: 1440 / 1650, position: 'relative', overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(208,168,101,.32)', backgroundColor: '#080D14', shadowColor: '#000', shadowOpacity: .42, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  mapArtwork: { position: 'absolute', left: 0, top: '-12.1%', width: '100%', aspectRatio: 1440 / 2560 },
  mapVignette: { position: 'absolute', inset: 0, backgroundColor: 'rgba(2,6,12,.08)', borderWidth: 1, borderColor: 'rgba(226,197,117,.12)', borderRadius: 24 },
  mapStatusBar: { position: 'absolute', left: 12, right: 12, top: 12, minHeight: 52, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: 'rgba(5,10,17,.72)', borderWidth: 1, borderColor: 'rgba(226,197,117,.25)' },
  mapStatusBarMobile: { position: 'relative', left: 0, right: 0, top: 0, width: '100%', minHeight: 58, backgroundColor: 'rgba(8,13,21,.92)' },
  mapKicker: { color: '#8FE5D5', fontSize: 9, fontWeight: '900', letterSpacing: 1.25 },
  mapPrompt: { color: '#EFE4CC', fontFamily: typography.display, fontSize: 16, marginTop: 2 },
  mapClock: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 99, backgroundColor: 'rgba(226,197,117,.08)' },
  mapClockText: { color: '#EBD498', fontSize: 11, fontWeight: '900' },
  mapHitArea: { position: 'absolute', minHeight: 54, backgroundColor: 'transparent', borderWidth: 0, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as never) : {}) },
  mapBusy: { position: 'absolute', left: '35%', right: '35%', top: '46%', minHeight: 70, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: 'rgba(5,9,15,.92)', borderWidth: 1, borderColor: 'rgba(103,215,193,.45)' },
  mapBusyText: { color: '#B9E9E0', fontSize: 10, fontWeight: '800' },
  locationModalBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(1,4,8,.70)', padding: 18 },
  locationModalPosition: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  locationModalGlass: { borderRadius: 26, borderColor: 'rgba(201,166,107,.28)', backgroundColor: 'rgba(8,12,20,.92)', padding: 19, gap: 13, shadowColor: '#000', shadowOpacity: .55, shadowRadius: 30, shadowOffset: { width: 0, height: 14 } },
  locationModalHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  locationModalIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(103,215,193,.11)', borderWidth: 1, borderColor: 'rgba(103,215,193,.24)' },
  locationModalKicker: { color: '#86DFD0', fontSize: 8, fontWeight: '900', letterSpacing: 1.25 },
  locationModalTitle: { fontFamily: typography.display, color: '#F5E6C8', fontSize: 25, lineHeight: 30, marginTop: 2 },
  locationModalClose: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' },
  locationModalSubtitle: { color: '#DCD0DA', fontSize: 14, fontWeight: '800' },
  locationModalDescription: { color: '#AAA4AE', fontSize: 13, lineHeight: 20 },
  locationPeoplePanel: { gap: 9, borderRadius: 17, padding: 12, backgroundColor: 'rgba(103,215,193,.045)', borderWidth: 1, borderColor: 'rgba(103,215,193,.13)' },
  locationPeopleHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  locationPeopleLabel: { color: '#91E5D5', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  locationPersonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationPersonName: { color: colors.text, fontSize: 13, fontWeight: '900' },
  locationPersonActivity: { color: '#96909B', fontSize: 11, lineHeight: 15, marginTop: 2 },
  locationModalActions: { flexDirection: 'row', gap: 9, marginTop: 2 },
  locationCancelButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', backgroundColor: 'rgba(255,255,255,.035)' },
  locationCancelText: { color: '#BEB7C1', fontSize: 13, fontWeight: '800' },
  locationTravelButton: { flex: 1, minHeight: 48, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#74D8C6' },
  locationTravelText: { color: '#07110F', fontSize: 13, fontWeight: '900' },
  locationUnavailableButton: { flex: 1, minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(226,197,117,.15)', backgroundColor: 'rgba(226,197,117,.055)' },
  locationUnavailableText: { color: '#B9AA87', fontSize: 12, fontWeight: '800' },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: 'row', gap: 12, minHeight: 85 },
  timelineRail: { width: 16, alignItems: 'center' },
  timelineDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#3A3540', borderWidth: 2, borderColor: '#77707D' },
  timelineDotKnown: { backgroundColor: '#6D5A8A', borderColor: '#B79ADD' },
  timelineDotNow: { backgroundColor: '#67D7C1', borderColor: '#B1F0E2' },
  timelineLine: { width: 1, flex: 1, backgroundColor: 'rgba(255,255,255,.15)' },
  timelineCard: { flex: 1, paddingBottom: 18 },
  timelineTime: { color: '#DABB71', fontSize: 11, fontWeight: '900', marginBottom: 4 },
  unknown: { color: '#6F6974' },
  changed: { color: '#67D7C1', fontSize: 9, fontWeight: '900', marginTop: 5 },
  pageTitle: { fontFamily: typography.display, color: colors.text, fontSize: 32 },
  pageCopy: { color: '#B0AAB5', fontSize: 14, lineHeight: 21, marginTop: 5 },
  directionPanel: { borderRadius: 22, borderWidth: 1, borderColor: 'rgba(103,215,193,.24)', backgroundColor: 'rgba(11,18,24,.94)', padding: 17, gap: 8, shadowColor: '#000', shadowOpacity: .2, shadowRadius: 18, shadowOffset: { width: 0, height: 9 } },
  directionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  directionPhase: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  directionPhaseText: { color: '#86E1CF', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  directionHint: { color: '#C7AADF', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  directionTitle: { fontFamily: typography.display, color: colors.text, fontSize: 23, marginTop: 2 },
  directionObjective: { color: '#E7E1E9', fontSize: 16, fontWeight: '900', lineHeight: 22 },
  directionReason: { color: '#A9A2AD', fontSize: 12, lineHeight: 18 },
  directionLeads: { gap: 7, marginTop: 5 },
  directionLead: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,.075)', backgroundColor: 'rgba(255,255,255,.025)', paddingHorizontal: 11, paddingVertical: 9 },
  directionLeadPrimary: { borderColor: 'rgba(103,215,193,.30)', backgroundColor: 'rgba(103,215,193,.075)' },
  directionLeadNumber: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(178,138,227,.13)' },
  directionLeadNumberPrimary: { backgroundColor: 'rgba(103,215,193,.18)' },
  directionLeadNumberText: { color: '#DCD1E5', fontSize: 11, fontWeight: '900' },
  directionLeadTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  directionLeadReason: { color: '#958F9A', fontSize: 10, lineHeight: 15, marginTop: 2 },
  directionLeadAction: { flexDirection: 'row', alignItems: 'center', gap: 1, paddingLeft: 4 },
  directionLeadActionText: { color: '#91E5D5', fontSize: 10, fontWeight: '900' },
  directionEmpty: { color: '#87818C', fontSize: 11, fontStyle: 'italic', marginTop: 3 },
  outcomePanel: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(178,138,227,.18)', backgroundColor: 'rgba(178,138,227,.055)', padding: 10, marginBottom: 3 },
  outcomePanelProgress: { borderColor: 'rgba(103,215,193,.22)', backgroundColor: 'rgba(103,215,193,.06)' },
  outcomeIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.045)' },
  outcomeTitle: { color: '#DDD7E0', fontSize: 12, fontWeight: '900' },
  outcomeText: { color: '#938D98', fontSize: 10, lineHeight: 15, marginTop: 2 },
  trackGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  trackCard: { flex: 1, flexBasis: '30%', minWidth: 220, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,.075)', backgroundColor: 'rgba(15,15,24,.86)', padding: 14, gap: 6 },
  trackCardActive: { borderColor: 'rgba(178,138,227,.30)', backgroundColor: 'rgba(178,138,227,.065)' },
  trackCardComplete: { borderColor: 'rgba(103,215,193,.25)', backgroundColor: 'rgba(103,215,193,.055)' },
  trackHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  trackState: { color: '#8FDCCC', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  trackCount: { color: '#A9A1AD', fontSize: 10, fontWeight: '900' },
  trackTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  trackQuestion: { color: '#D2C6DB', fontSize: 11, lineHeight: 16, fontWeight: '700' },
  trackDescription: { color: '#8E8793', fontSize: 10, lineHeight: 15 },
  trackProgress: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.07)', overflow: 'hidden', marginTop: 3 },
  trackProgressFill: { height: '100%', borderRadius: 2, backgroundColor: '#6FD8C4' },
  evidenceCard: { borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,.09)', backgroundColor: 'rgba(15,15,24,.88)', padding: 16, gap: 7 },
  evidenceFresh: { borderColor: 'rgba(103,215,193,.36)' },
  evidenceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  evidenceTitle: { color: colors.text, fontWeight: '800', fontSize: 15, flex: 1 },
  presented: { color: '#958E99', fontSize: 11 },
  dossierGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dossier: { flexBasis: '47%', flexGrow: 1, minWidth: 290, flexDirection: 'row', gap: 13, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,.09)', backgroundColor: 'rgba(15,15,24,.9)', padding: 15 },
  role: { color: '#B596D7', fontSize: 12, fontWeight: '700', marginTop: 3 },
  dossierBody: { color: '#A7A1AC', fontSize: 12, lineHeight: 17, marginTop: 7 },
  meters: { gap: 7, marginTop: 10 },
  meter: { flex: 1, gap: 5, minWidth: 0 },
  meterLabel: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  meterText: { color: '#A49EAA', fontSize: 11, fontWeight: '700' },
  meterValue: { color: '#D7D0D9', fontSize: 11, fontWeight: '900' },
  meterTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.09)', overflow: 'hidden' },
  meterFill: { height: '100%' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  stat: { flex: 1, minWidth: 130, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', backgroundColor: 'rgba(15,15,24,.88)', padding: 15 },
  statValue: { fontFamily: typography.display, color: '#EEE0A9', fontSize: 26 },
  statLabel: { color: '#A19AA6', fontSize: 11, marginTop: 4 },
  recapCard: { borderLeftWidth: 2, borderLeftColor: '#67D7C1', paddingLeft: 14, gap: 5 },
  setting: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,.09)', backgroundColor: 'rgba(15,15,24,.88)', padding: 16, gap: 12 },
  settingTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  settingOptions: { flexDirection: 'row', gap: 8 },
  settingOption: { flex: 1, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)' },
  settingOptionActive: { backgroundColor: 'rgba(103,215,193,.13)', borderColor: 'rgba(103,215,193,.45)' },
  settingOptionText: { color: '#A39DA8', fontSize: 12, fontWeight: '700' },
  settingOptionTextActive: { color: '#9BE9DA' },
  campaignButton: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', alignItems: 'center', justifyContent: 'center' },
  campaignButtonText: { color: '#C7C0CA', fontSize: 12, fontWeight: '800' },
  campaignDanger: { borderColor: 'rgba(255,113,129,.24)', backgroundColor: 'rgba(255,113,129,.05)' },
  campaignDangerText: { color: '#FF9CAA', fontSize: 12, fontWeight: '900' },
  conversation: { width: 470, minWidth: 440, maxWidth: 500, flexShrink: 0, minHeight: 0, borderWidth: 1, borderColor: 'rgba(185,145,82,.18)', borderRadius: 20, overflow: 'hidden', backgroundColor: 'rgba(8,9,16,.98)' },
  conversationCompact: { width: '100%', minWidth: 0, maxWidth: '100%', flex: 1, borderWidth: 0, borderRadius: 0 },
  conversationHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  storyCharacterPortraitTrigger: { borderRadius: 26 },
  conversationIdentity: { flex: 1, minWidth: 0 },
  conversationNameLine: { minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  storyCharacterNameTrigger: { minWidth: 0, flexShrink: 1, borderRadius: 7 },
  conversationName: { color: colors.text, fontWeight: '900', fontSize: 17, flexShrink: 1 },
  inlinePeopleButton: { marginLeft: 'auto', flexShrink: 0, minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, paddingLeft: 8, paddingVertical: 5 },
  inlinePeopleLabel: { color: '#74D8C6', fontSize: 9, fontWeight: '900', letterSpacing: .7 },
  storyCharacterHintTrigger: { alignSelf: 'flex-start', borderRadius: 6 },
  storyCharacterHint: { color: '#817A86', fontSize: 10, fontWeight: '700', marginTop: 3 },
  relationshipMeters: { flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingBottom: 12 },
  relationshipCue: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, borderRadius: 12, backgroundColor: 'rgba(103,215,193,.055)', paddingHorizontal: 11, paddingVertical: 8 },
  relationshipCueDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#67D7C1' },
  relationshipCueText: { flex: 1, color: '#AAA5AE', fontSize: 11, lineHeight: 16 },
  characterPopupBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(1,4,8,.70)', padding: 18 },
  characterPopupPosition: { width: '100%', maxWidth: 500, alignSelf: 'center' },
  characterPopupGlass: { borderRadius: 27, borderColor: 'rgba(103,215,193,.20)', backgroundColor: 'rgba(9,12,20,.94)', padding: 19, gap: 13, shadowColor: '#000', shadowOpacity: .56, shadowRadius: 30, shadowOffset: { width: 0, height: 14 } },
  characterPopupHeader: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  characterPopupKicker: { color: '#79DCCC', fontSize: 8, fontWeight: '900', letterSpacing: 1.15 },
  characterPopupName: { fontFamily: typography.display, color: colors.text, fontSize: 26, lineHeight: 31, marginTop: 2 },
  characterPopupRole: { color: '#B8A4CB', fontSize: 12, fontWeight: '700', marginTop: 2 },
  characterPopupClose: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' },
  characterPopupFact: { gap: 5, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,.075)', backgroundColor: 'rgba(255,255,255,.035)', padding: 13 },
  characterPopupFactLabel: { color: '#837C88', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  characterPopupFactText: { color: '#D7D0DA', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  characterPopupDeparture: { color: '#E1C57B', fontSize: 10, fontWeight: '900' },
  characterPopupMeters: { flexDirection: 'row', gap: 12 },
  characterPopupBio: { color: '#918A96', fontSize: 11, lineHeight: 17, paddingHorizontal: 2 },
  personTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 16, paddingBottom: 12 },
  personTab: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 38, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,.06)', backgroundColor: 'rgba(255,255,255,.045)' },
  personTabActive: { backgroundColor: 'rgba(103,215,193,.13)', borderColor: 'rgba(103,215,193,.35)' },
  personTabText: { color: '#9B95A0', fontSize: 12, fontWeight: '700' },
  personTabTextActive: { color: '#A9EEE1' },
  messages: { flex: 1, minHeight: 190, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.06)', backgroundColor: '#06070D' },
  messageContent: { gap: 10, paddingHorizontal: 14, paddingVertical: 16, flexGrow: 1, justifyContent: 'flex-end' },
  message: { maxWidth: '86%', minWidth: 0, flexShrink: 1, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 10, gap: 4 },
  characterMessage: { alignSelf: 'flex-start', backgroundColor: '#17151F', borderWidth: 1, borderColor: 'rgba(255,255,255,.075)' },
  userMessage: { alignSelf: 'flex-end', backgroundColor: '#532457', borderWidth: 1, borderColor: 'rgba(226,107,237,.16)' },
  systemMessage: { alignSelf: 'center', maxWidth: '96%', backgroundColor: 'rgba(224,183,104,.055)', borderWidth: 1, borderColor: 'rgba(224,183,104,.18)', borderRadius: 12, paddingHorizontal: 16 },
  presenceMarker: { alignSelf: 'center', maxWidth: '98%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 8, paddingVertical: 5 },
  presenceMarkerText: { color: '#A8A0AC', fontSize: 11, lineHeight: 16, fontStyle: 'italic', textAlign: 'center' },
  presenceFollow: { flexDirection: 'row', alignItems: 'center', gap: 1, minHeight: 34, paddingHorizontal: 7 },
  presenceFollowText: { color: '#8CE5D3', fontSize: 11, fontWeight: '900' },
  messageSpeaker: { color: '#9BE9DA', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  messageSpeakerRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  interjectionLabel: { color: '#A792B8', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  userTarget: { color: '#DCAAE3', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  stageDirection: { color: '#AAA1AD', fontSize: 12, lineHeight: 17, fontStyle: 'italic', paddingVertical: 2 },
  messageEvidence: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(226,197,117,.23)', backgroundColor: 'rgba(226,197,117,.055)', padding: 8, marginBottom: 3 },
  messageEvidenceLabel: { color: '#A99056', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  messageEvidenceTitle: { color: '#E6D5A2', fontSize: 11, fontWeight: '800', marginTop: 1 },
  messageLeadActions: { gap: 6, marginTop: 5 },
  messageLeadButton: { minHeight: 36, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(103,215,193,.22)', backgroundColor: 'rgba(103,215,193,.065)', paddingHorizontal: 9, paddingVertical: 7 },
  messageLeadButtonText: { flex: 1, color: '#B6EEE3', fontSize: 10, fontWeight: '900' },
  messageText: { color: colors.text },
  systemText: { color: '#B8AF9F', fontStyle: 'italic', textAlign: 'center' },
  messageTime: { color: '#817A86', fontSize: 10, alignSelf: 'flex-end' },
  responseArea: { gap: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.06)', paddingHorizontal: 12, paddingTop: 10 },
  responseLabel: { color: '#756E7A', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  approaches: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  approach: { flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: '100%', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(178,138,227,.28)', backgroundColor: 'rgba(178,138,227,.08)', paddingHorizontal: 11, paddingVertical: 8 },
  approachActive: { borderColor: 'rgba(103,215,193,.5)', backgroundColor: 'rgba(103,215,193,.1)' },
  approachText: { color: '#DAC5F1', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  approachTime: { color: '#9E8AAF', fontSize: 10, fontWeight: '900' },
  evidencePicker: { gap: 6, paddingHorizontal: 12, paddingVertical: 9 },
  evidencePickerScroll: { flexGrow: 0, maxHeight: 52 },
  evidencePick: { maxWidth: 165, minHeight: 34, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', paddingHorizontal: 10, justifyContent: 'center' },
  evidencePickActive: { borderColor: 'rgba(224,183,104,.44)', backgroundColor: 'rgba(224,183,104,.08)' },
  evidencePickText: { color: '#B8B1BC', fontSize: 10 },
  composerWrap: { gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.08)', backgroundColor: 'rgba(11,10,17,.98)', padding: 12 },
  absentComposer: { gap: 5, borderTopWidth: 1, borderTopColor: 'rgba(103,215,193,.16)', backgroundColor: 'rgba(12,17,22,.98)', padding: 14 },
  absentComposerTitle: { color: '#DDD7E0', fontSize: 14, fontWeight: '900' },
  absentComposerText: { color: '#9B95A0', fontSize: 12, lineHeight: 18 },
  followForecast: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 3 },
  followForecastText: { color: '#C9C1CC', fontSize: 11, fontWeight: '800' },
  followConfidence: { color: '#87DCCB', fontSize: 10, fontWeight: '900' },
  followUncertain: { color: '#DCC178' },
  absentActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 },
  absentFollow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, marginTop: 5, borderRadius: 12, backgroundColor: '#67D7C1', paddingHorizontal: 12 },
  absentFollowText: { color: '#08120F', fontSize: 12, fontWeight: '900' },
  absentSecondary: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', backgroundColor: 'rgba(255,255,255,.045)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, marginTop: 5 },
  absentSecondaryText: { color: '#C5BEC8', fontSize: 11, fontWeight: '800' },
  composerContext: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: 'rgba(178,138,227,.07)', paddingHorizontal: 10, paddingVertical: 7 },
  composerContextLabel: { color: '#8D7B9B', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  composerContextText: { flex: 1, color: '#CFC4D7', fontSize: 11, fontWeight: '700' },
  evidenceAttachment: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,197,117,.25)', backgroundColor: 'rgba(226,197,117,.055)', padding: 10 },
  evidenceAttachmentTitle: { color: '#E5D6AB', fontSize: 12, fontWeight: '900', marginTop: 2 },
  evidenceAttachmentSource: { color: '#91877C', fontSize: 10, marginTop: 2 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 },
  attachEvidence: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(226,197,117,.24)', backgroundColor: 'rgba(226,197,117,.06)' },
  attachEvidenceActive: { backgroundColor: '#D9C27F', borderColor: '#D9C27F' },
  input: { flex: 1, minWidth: 0, minHeight: 48, maxHeight: 120, borderRadius: 16, backgroundColor: '#17141E', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, lineHeight: 21 },
  send: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#68D5C0', alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.35 },
  mobileChatDock: { marginHorizontal: 12, marginBottom: 8, minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(103,215,193,.3)', backgroundColor: 'rgba(12,18,24,.98)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11 },
  mobileChatDockCopy: { flex: 1, minWidth: 0 },
  mobileChatDockLabel: { color: '#6DD6C1', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  mobileChatDockName: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 2 },
  storyMenuBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1,4,8,.58)', paddingHorizontal: 12, paddingBottom: 18 },
  storyMenuPosition: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  storyMenuGlass: { borderRadius: 24, borderColor: 'rgba(103,215,193,.20)', backgroundColor: 'rgba(10,12,21,.88)', padding: 16, shadowColor: '#000', shadowOpacity: .48, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  storyMenuHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  storyMenuKicker: { color: '#76DCCC', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  storyMenuTitle: { fontFamily: typography.display, color: colors.text, fontSize: 22, marginTop: 2 },
  storyMenuClose: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' },
  storyMenuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  storyMenuItem: { flexBasis: '30%', flexGrow: 1, minWidth: 96, minHeight: 76, borderRadius: 17, alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', backgroundColor: 'rgba(255,255,255,.035)' },
  storyMenuItemActive: { borderColor: 'rgba(103,215,193,.42)', backgroundColor: 'rgba(103,215,193,.12)' },
  storyMenuItemText: { color: '#B3ACB8', fontSize: 11, fontWeight: '800' },
  storyMenuItemTextActive: { color: '#A5EEE0' },
  midnight: { alignItems: 'center', gap: 10, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(224,183,104,.28)', backgroundColor: 'rgba(224,183,104,.06)', padding: 28 },
  midnightTitle: { fontFamily: typography.display, color: colors.text, fontSize: 28 },
  midnightText: { color: '#AAA4AF', fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 520 },
  goldButton: { minHeight: 46, borderRadius: 14, backgroundColor: '#DDB765', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  goldButtonText: { color: '#171109', fontWeight: '900' },
  nav: { flexGrow: 0, maxHeight: 68, borderTopWidth: 1, borderTopColor: 'rgba(185,145,82,.18)', backgroundColor: 'rgba(9,10,17,.96)' },
  navCompact: { maxHeight: 54, borderTopWidth: 0, borderBottomWidth: 1, borderBottomColor: 'rgba(185,145,82,.18)' },
  navContent: { minWidth: '100%', justifyContent: 'center', paddingHorizontal: 8, gap: 3 },
  navItem: { minWidth: 92, height: 66, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12, borderTopWidth: 2, borderTopColor: 'transparent' },
  navItemCompact: { minWidth: 76, height: 52, flexDirection: 'row', gap: 6, paddingHorizontal: 10, borderTopWidth: 0, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  navItemActive: { backgroundColor: 'rgba(103,215,193,.055)', borderTopColor: '#67D7C1' },
  navItemCompactActive: { borderTopColor: 'transparent', borderBottomColor: '#67D7C1' },
  navLabel: { color: '#938D98', fontSize: 11, fontWeight: '700' },
  navLabelCompact: { fontSize: 10 },
  navLabelActive: { color: '#A9EEE1' },
  errorBanner: { borderRadius: 13, backgroundColor: 'rgba(255,113,129,.08)', borderWidth: 1, borderColor: 'rgba(255,113,129,.22)', padding: 12 },
  error: { color: '#FF9CAA', fontSize: 13, textAlign: 'center' },
  smallButton: { borderRadius: 13, backgroundColor: '#67D7C1', paddingHorizontal: 16, paddingVertical: 10 },
  smallButtonText: { color: '#07110F', fontWeight: '900' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.995 }] },
  disabled: { opacity: 0.52 },
});
