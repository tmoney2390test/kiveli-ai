import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Brain, CheckSquare, ChevronDown, LockKeyhole, Plus, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react-native';
import { CharacterAvatar, EmptyState, FrostedSurface, Screen } from '../src/components';
import { MemoryActionToast, MemoryBulkBar, MemoryDetailSheet, MemoryEditorSheet, MemoryInsightsPanel, MemoryJournalRow, MemoryPrivacySheet } from '../src/components/memory/MemoryCenterPrimitives';
import { colors, radius, spacing, typography } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { getMemoryCenter, getMemoryHistory, mutateMemory } from '../src/lib/api';
import { activeCompanion } from '../src/lib/companionLife';
import { confirmAction } from '../src/lib/dialogs';
import { MEMORY_CATEGORY_OPTIONS, memoryCategoryCount, mergeMemoryPages, optimisticMemoryMutation } from '../src/lib/memoryCenter';
import type { CharacterInstance, MemoryCenterAuthorKind, MemoryCenterCategory, MemoryCenterItem, MemoryCenterResponse, MemoryCenterSort } from '../src/types';
import { subscriptionHref } from '../src/lib/subscriptionPresentation';

type EditorState={mode:'create'}|{mode:'edit';memory:MemoryCenterItem};
type ToastState={id:number;message:string};
type MemoryCenterSummary=Pick<MemoryCenterResponse,'count'|'categories'|'insights'>;
const SORTS:Array<{key:MemoryCenterSort;label:string}>=[{key:'pinned',label:'Pinned first'},{key:'newest',label:'Newest'},{key:'oldest',label:'Oldest'},{key:'recalled',label:'Most recalled'}];

function pickMemorySummary(page:MemoryCenterResponse):MemoryCenterSummary{
  return{count:page.count,categories:page.categories,insights:page.insights};
}

function cacheMemoryPage(cache:Map<string,MemoryCenterResponse>,key:string,page:MemoryCenterResponse){
  cache.delete(key);cache.set(key,page);
  while(cache.size>24){const oldest=cache.keys().next().value;if(!oldest)break;cache.delete(oldest);}
}

export default function Memories(){
  const params=useLocalSearchParams<{character?:string;privacy?:string}>(),privacyMode=params.privacy==='1';
  const{width}=useWindowDimensions(),desktop=width>=820,compact=width<430,insets=useSafeAreaInsets();
  const{snapshot,refresh}=useTogether();
  const companion=params.character?snapshot?.characters.find((item)=>item.together_character_templates.slug===params.character||item.together_character_templates.public_handle===params.character||item.character_template_id===params.character||item.id===params.character):snapshot?activeCompanion(snapshot):undefined;
  const connections=useMemo(()=>(snapshot?.characters??[]).filter((item)=>item.contact_added_at||item.introduced_at||(snapshot?.memoryCounts?.[item.id]??0)>0).sort((a,b)=>a.together_character_templates.name.localeCompare(b.together_character_templates.name)),[snapshot?.characters,snapshot?.memoryCounts]);
  const name=companion?.together_character_templates.name??'Your companion';
  const[result,setResult]=useState<MemoryCenterResponse|null>(null),[loading,setLoading]=useState(false),[loadingMore,setLoadingMore]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[searchTerm,setSearchTerm]=useState(''),[category,setCategory]=useState<MemoryCenterCategory>('all'),[sort,setSort]=useState<MemoryCenterSort>('pinned'),[selected,setSelected]=useState<MemoryCenterItem|null>(null),[revisions,setRevisions]=useState<MemoryCenterItem[]>([]),[historyLoading,setHistoryLoading]=useState(false),[busy,setBusy]=useState(''),[selectedIds,setSelectedIds]=useState<Set<string>>(new Set()),[selectionMode,setSelectionMode]=useState(false),[editor,setEditor]=useState<EditorState|null>(null),[privacyOpen,setPrivacyOpen]=useState(false),[controlsOpen,setControlsOpen]=useState(false),[companionOpen,setCompanionOpen]=useState(false),[localCategories,setLocalCategories]=useState<Record<string,boolean>>({}),[toast,setToast]=useState<ToastState|null>(null);
  const requestVersion=useRef(0);
  const requestInFlight=useRef<number|null>(null);
  const resultRef=useRef<MemoryCenterResponse|null>(null);
  const summaryCache=useRef(new Map<string,MemoryCenterSummary>());
  const pageCache=useRef(new Map<string,MemoryCenterResponse>());
  const dismissToast=useCallback(()=>setToast(null),[]);

  useEffect(()=>{const timer=setTimeout(()=>setSearchTerm(query.trim()),260);return()=>clearTimeout(timer);},[query]);
  useEffect(()=>{resultRef.current=result;},[result]);
  useEffect(()=>setLocalCategories(snapshot?.profile?.memory_categories??{}),[snapshot?.profile?.memory_categories]);
  useEffect(()=>{setSelected(null);setRevisions([]);setSelectedIds(new Set());setSelectionMode(false);setEditor(null);},[companion?.id]);

  const load=useCallback(async(reset=true)=>{
    if(!companion)return;
    if(!reset&&requestInFlight.current!==null)return;
    const contextKey=`${companion.id}:${privacyMode?'privacy':'companion'}`;
    const pageKey=`${contextKey}:${searchTerm}:${category}:${sort}`;
    const cachedPage=reset?pageCache.current.get(pageKey):undefined;
    const cachedSummary=summaryCache.current.get(contextKey)??(cachedPage?pickMemorySummary(cachedPage):undefined);
    if(cachedPage&&!summaryCache.current.has(contextKey))summaryCache.current.set(contextKey,pickMemorySummary(cachedPage));
    const version=++requestVersion.current;
    requestInFlight.current=version;
    if(reset){
      if(cachedPage){resultRef.current=cachedPage;setResult(cachedPage);setLoading(false);}
      else setLoading(true);
    }else setLoadingMore(true);
    setError('');
    try{
      const current=resultRef.current;
      const page=await getMemoryCenter(companion.id,{privacyMode,query:searchTerm,category,sort,...(!reset&&current?.pageInfo.nextCursor?{cursor:current.pageInfo.nextCursor}:{}),limit:30,includeSummary:!cachedSummary});
      if(version!==requestVersion.current)return;
      if(reset){
        const summary=cachedSummary??pickMemorySummary(page);
        summaryCache.current.set(contextKey,summary);
        const next={...page,...summary};
        resultRef.current=next;cacheMemoryPage(pageCache.current,pageKey,next);setResult(next);
      }else setResult((currentResult)=>{
        const base=currentResult??page;
        const next={...page,count:base.count,categories:base.categories,memories:mergeMemoryPages(base.memories,page.memories),insights:base.insights};
        resultRef.current=next;cacheMemoryPage(pageCache.current,pageKey,next);return next;
      });
    }catch(caught){if(version===requestVersion.current)setError(caught instanceof Error?caught.message:'Memories could not be loaded.');}
    finally{if(version===requestVersion.current){requestInFlight.current=null;setLoading(false);setLoadingMore(false);}}
  },[category,companion?.id,privacyMode,searchTerm,sort]);

  useEffect(()=>{void load(true);},[category,companion?.id,privacyMode,searchTerm,sort]);
  const choose=(item:CharacterInstance)=>router.replace(`/memories?character=${item.together_character_templates.slug}${privacyMode?'&privacy=1':''}` as never);
  const notify=(message:string)=>setToast({id:Date.now(),message});
  const reload=async(message?:string)=>{if(companion){const prefix=`${companion.id}:${privacyMode?'privacy':'companion'}`;summaryCache.current.delete(prefix);for(const key of pageCache.current.keys())if(key.startsWith(`${prefix}:`))pageCache.current.delete(key);}await Promise.all([load(true),refresh()]);if(message)notify(message);};

  const openMemory=async(memory:MemoryCenterItem)=>{setSelected(memory);setRevisions([memory]);if(!result?.access.inspector)return;setHistoryLoading(true);try{const history=await getMemoryHistory(memory.id);setRevisions(history.revisions);}catch{setRevisions([memory]);}finally{setHistoryLoading(false);}};
  const openSource=(memory:MemoryCenterItem)=>{if(memory.sourceHref)router.push(memory.sourceHref as never);};

  const pinMemory=async(memory:MemoryCenterItem)=>{const before=result;setBusy(memory.id);setResult((current)=>current?{...current,memories:current.memories.map((item)=>item.id===memory.id?{...item,pinned:!memory.pinned}:item)}:current);setSelected((current)=>current?.id===memory.id?{...current,pinned:!memory.pinned}:current);try{await mutateMemory({action:'pin',memoryId:memory.id,pinned:!memory.pinned});await reload(memory.pinned?'Memory unpinned':'Memory pinned');}catch(caught){setResult(before);setError(caught instanceof Error?caught.message:'That memory could not be updated.');}finally{setBusy('');}};
  const forgetMemory=(memory:MemoryCenterItem)=>confirmAction({title:`Forget this memory?`,message:`${name.split(' ')[0]} will stop using this detail. Your conversation history and relationship progress stay intact.`,confirmLabel:'Forget',destructive:true,onConfirm:async()=>{const before=result;setBusy(memory.id);setSelected(null);setResult((current)=>current?{...current,count:Math.max(0,current.count-1),memories:current.memories.filter((item)=>item.id!==memory.id)}:current);try{await mutateMemory({action:'forget',memoryId:memory.id});await reload('Memory forgotten');}catch(caught){setResult(before);setError(caught instanceof Error?caught.message:'That memory could not be forgotten.');}finally{setBusy('');}}});
  const saveEditor=async(input:{text:string;kind:MemoryCenterAuthorKind;personaId?:string;pinned:boolean})=>{if(!companion||!editor)return;setBusy('editor');try{if(editor.mode==='create')await mutateMemory({action:'create',characterInstanceId:companion.id,kind:input.kind,text:input.text,pinned:input.pinned,...(input.personaId?{personaId:input.personaId}:{})});else await mutateMemory({action:'edit',memoryId:editor.memory.id,text:input.text});setEditor(null);setSelected(null);await reload(editor.mode==='create'?input.kind==='core_rule'?`${name.split(' ')[0]} will treat this as a core rule`:`${name.split(' ')[0]} will remember this`:'Memory corrected');}catch(caught){setError(caught instanceof Error?caught.message:'That memory could not be saved.');}finally{setBusy('');}};
  const restoreRevision=(memory:MemoryCenterItem,revision:MemoryCenterItem)=>confirmAction({title:'Restore this earlier wording?',message:'The current wording will remain available in correction history.',confirmLabel:'Restore',onConfirm:async()=>{setBusy(memory.id);try{await mutateMemory({action:'restore',memoryId:memory.id,revisionId:revision.id});setSelected(null);await reload('Earlier memory restored');}catch(caught){setError(caught instanceof Error?caught.message:'That version could not be restored.');}finally{setBusy('');}}});

  const toggleSelection=(id:string)=>{setSelectedIds((current)=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);if(!next.size)setSelectionMode(false);return next;});};
  const beginSelection=()=>{setSelectionMode(true);setSelectedIds(new Set());};
  const cancelSelection=()=>{setSelectionMode(false);setSelectedIds(new Set());};
  const bulk=async(operation:'pin'|'unpin'|'forget')=>{const ids=[...selectedIds];if(!ids.length)return;const execute=async()=>{const before=result;setBusy('bulk');setResult((current)=>current?{...current,count:operation==='forget'?Math.max(0,current.count-ids.length):current.count,memories:optimisticMemoryMutation(current.memories,ids,operation)}:current);cancelSelection();try{await mutateMemory({action:'bulk',memoryIds:ids,operation});await reload(operation==='forget'?`${ids.length} memories forgotten`:`${ids.length} memories ${operation==='pin'?'pinned':'unpinned'}`);}catch(caught){setResult(before);setError(caught instanceof Error?caught.message:'Those memories could not be updated.');}finally{setBusy('');}};if(operation==='forget')confirmAction({title:`Forget ${ids.length} memories?`,message:`${name.split(' ')[0]} will stop using these details.`,confirmLabel:'Forget',destructive:true,onConfirm:execute});else await execute();};

  const toggleCategory=async(key:string,value:boolean)=>{if(busy)return;const before=localCategories,next={...localCategories,[key]:value};setLocalCategories(next);setBusy(key);try{await mutateMemory({action:'preferences',categories:next});await refresh();notify(value?'Memory category enabled':'Memory category disabled');}catch(caught){setLocalCategories(before);setError(caught instanceof Error?caught.message:'Memory privacy could not be updated.');}finally{setBusy('');}};
  const forgetAll=()=>confirmAction({title:privacyMode?'Erase all remembered information in this Life?':`Forget everything ${name.split(' ')[0]} remembers?`,message:privacyMode?'Every companion in this Life will stop using saved information. Relationships, Moments, Dates, and conversation history remain.':'Saved facts, preferences, emotional context, and follow-ups will be forgotten. Relationship progress and conversation history remain.',confirmLabel:privacyMode?'Erase all':'Forget memories',destructive:true,onConfirm:async()=>{setBusy('erase');try{await mutateMemory({action:'forget_all',...(privacyMode?{}:{characterInstanceId:companion?.id})});setPrivacyOpen(false);await reload('Remembered information erased');}catch(caught){setError(caught instanceof Error?caught.message:'Remembered information could not be erased.');}finally{setBusy('');}}});

  if(!snapshot)return null;
  const memories=result?.memories??[];
  const firstName=name.split(' ')[0];
  const filteredCount=searchTerm?`${memories.length}${result?.pageInfo.hasMore?'+':''} shown`:null;
  const filtersActive=Boolean(query||category!=='all'||sort!=='pinned');
  const hero=<View style={[styles.hero,desktop&&styles.heroDesktop]}>
    <View style={[styles.heroIdentity,compact&&styles.heroIdentityCompact]}>
      {companion?<CharacterAvatar slug={companion.together_character_templates.slug} name={name} template={companion.together_character_templates} version={companion.together_character_versions} size={desktop?112:compact?82:96}/>:null}
      <View style={styles.heroCopy}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Choose companion. ${name} selected`} disabled={connections.length<2} onPress={()=>setCompanionOpen(true)} style={({pressed})=>[styles.companionPicker,connections.length<2&&styles.companionPickerSingle,pressed&&styles.pressed]}>
          <Text numberOfLines={1} style={styles.companionPickerText}>{name}</Text>
          {connections.length>1?<ChevronDown size={18} color={colors.textSecondary}/>:null}
        </Pressable>
        <Text style={styles.sharedHistory}>Your shared history</Text>
        <Text accessibilityRole="header" style={[styles.heroTitle,compact&&styles.heroTitleCompact,desktop&&styles.heroTitleDesktop]}>{privacyMode?'Remembered information':`What ${firstName} remembers`}</Text>
        <Text style={styles.heroSubtitle}>{privacyMode?'Review what companions retain across this Life.':'Little details. A story that stays with you.'}</Text>
      </View>
    </View>
  </View>;
  const errorCard=error?<Pressable onPress={()=>void load(true)} style={styles.errorCard}><Text style={styles.errorText}>{error}</Text><Text style={styles.retryText}>Try again</Text></Pressable>:null;
  const journal=<View style={styles.journal}>
    <FlatList
      data={memories}
      keyExtractor={(item)=>item.id}
      renderItem={({item})=><MemoryJournalRow memory={item} name={name} privacyMode={privacyMode} selectionMode={selectionMode} selected={selectedIds.has(item.id)} busy={busy===item.id} onOpen={()=>void openMemory(item)} onToggle={()=>toggleSelection(item.id)} onForget={()=>forgetMemory(item)} onSource={item.sourceHref?()=>openSource(item):undefined}/>}
      onEndReached={()=>{if(result?.pageInfo.hasMore&&!loading&&!loadingMore)void load(false);}}
      onEndReachedThreshold={.35}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.listContent,{paddingBottom:Math.max(40,insets.bottom+24)},!memories.length&&styles.emptyContent]}
      ListHeaderComponent={<View>
        {hero}
        {result?.access.manualControl&&!privacyMode?<Pressable accessibilityRole="button" onPress={()=>setEditor({mode:'create'})} style={({pressed})=>[styles.addMemory,pressed&&styles.addMemoryPressed]}><Plus size={27} strokeWidth={2.4} color="#100A12"/><Text style={styles.addMemoryText}>Add a memory</Text></Pressable>:null}
        {errorCard}
        <View style={styles.listHeader}><Text style={styles.listTitle}>Remembered moments</Text><Text style={styles.listCount}>{filteredCount??`${result?.count??0} ${result?.count===1?'memory':'memories'}`}</Text></View>
      </View>}
      ListEmptyComponent={loading?<View style={styles.loading}><ActivityIndicator color={colors.rose}/><Text style={styles.muted}>Gathering {firstName}'s memories…</Text></View>:<EmptyState title={query?'No matching memories':`${firstName} is listening`} body={query?'Try another word, place, or category.':'Meaningful details you share will collect here.'} action={result?.access.manualControl&&!privacyMode&&!query?'Add your first memory':undefined} onAction={result?.access.manualControl&&!privacyMode&&!query?()=>setEditor({mode:'create'}):undefined}/>}
      ListFooterComponent={<View style={styles.journalFooter}>{loadingMore?<View style={styles.loadingMore}><ActivityIndicator color={colors.rose}/><Text style={styles.muted}>Loading more…</Text></View>:null}<MemoryInsightsPanel name={name} insights={result?.insights??null}/><View style={styles.trustDivider}/><Text style={styles.trustText}>Your memories, under your control.</Text></View>}
    />
    {selectionMode?<MemoryBulkBar count={selectedIds.size} busy={busy==='bulk'} onCancel={cancelSelection} onPin={()=>void bulk('pin')} onUnpin={()=>void bulk('unpin')} onForget={()=>void bulk('forget')}/>:null}
  </View>;

  return <Screen scroll={false} contentStyle={styles.page}>
    <View pointerEvents="none" style={styles.roseGlow}/><View pointerEvents="none" style={styles.violetGlow}/>
    <View style={[styles.topBar,{minHeight:70+insets.top,paddingTop:insets.top}]}>
      <Pressable accessibilityLabel="Go back" onPress={()=>router.canGoBack()?router.back():router.replace('/')} style={({pressed})=>[styles.topIcon,pressed&&styles.pressed]}><ArrowLeft size={25} color={colors.textSecondary}/></Pressable>
      <Text style={styles.topTitle}>Memory journal</Text>
      <Pressable accessibilityLabel="Memory journal filters and controls" onPress={()=>setControlsOpen(true)} style={({pressed})=>[styles.topIcon,pressed&&styles.pressed]}><SlidersHorizontal size={25} color={colors.textSecondary}/>{filtersActive?<View style={styles.activeDot}/>:null}</Pressable>
    </View>
    {result&&!result.access.inspector&&!privacyMode?<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.lockedScroll}>{hero}{errorCard}<LockedMemoryCenter name={name} count={result.count} onUpgrade={()=>router.push(subscriptionHref({intent:'memory',returnTo:params.character?`/memories?character=${encodeURIComponent(params.character)}`:'/memories'}) as never)} onPrivacy={()=>setPrivacyOpen(true)}/></ScrollView>:journal}
    <MemoryJournalControls visible={controlsOpen} desktop={desktop} query={query} category={category} sort={sort} counts={result?.categories??{}} total={result?.count??0} canSelect={Boolean(result?.access.inspector||privacyMode)} onClose={()=>setControlsOpen(false)} onQuery={setQuery} onCategory={setCategory} onSort={setSort} onSelect={()=>{setControlsOpen(false);beginSelection();}} onPrivacy={()=>{setControlsOpen(false);setPrivacyOpen(true);}}/>
    <MemoryCompanionPicker visible={companionOpen} desktop={desktop} companions={connections} activeId={companion?.id} counts={snapshot.memoryCounts??{}} onClose={()=>setCompanionOpen(false)} onChoose={(item)=>{setCompanionOpen(false);choose(item);}}/>
    <MemoryDetailSheet memory={selected} name={name} revisions={revisions} historyLoading={historyLoading} busy={Boolean(selected&&busy===selected.id)} manualControl={Boolean(result?.access.manualControl)} onClose={()=>setSelected(null)} onEdit={(memory)=>{setEditor({mode:'edit',memory});setSelected(null);}} onPin={(memory)=>void pinMemory(memory)} onForget={forgetMemory} onRestore={restoreRevision} onSource={selected?.sourceHref?openSource:undefined}/>
    <MemoryEditorSheet visible={Boolean(editor)} name={name} memory={editor?.mode==='edit'?editor.memory:null} busy={busy==='editor'} personas={snapshot.personas??[]} activePersonaId={snapshot.activePersona?.id??snapshot.activeContinuity?.persona_id} onClose={()=>setEditor(null)} onSave={(input)=>void saveEditor(input)}/>
    <MemoryPrivacySheet visible={privacyOpen} categories={localCategories} busy={busy} globalErase={privacyMode} onClose={()=>setPrivacyOpen(false)} onToggle={(key,value)=>void toggleCategory(key,value)} onForgetAll={forgetAll}/>
    {toast?<MemoryActionToast key={toast.id} message={toast.message} onDismiss={dismissToast}/>:null}
  </Screen>;
}

function LockedMemoryCenter({name,count,onUpgrade,onPrivacy}:{name:string;count:number;onUpgrade:()=>void;onPrivacy:()=>void}){return <FrostedSurface intensity={88} style={styles.locked}><View style={styles.lockIcon}><Brain size={27} color="#D8A5FF"/><View style={styles.lockMini}><LockKeyhole size={12} color="#fff"/></View></View><Text style={styles.lockedKicker}>KIVELLE+ MEMORY CENTER</Text><Text style={styles.lockedTitle}>{name.split(' ')[0]} has remembered {count} {count===1?'thing':'things'}.</Text><Text style={styles.lockedCopy}>Everyday continuity stays active. Upgrade to search, review, correct, pin, and add what matters.</Text><Pressable onPress={onUpgrade} style={styles.upgrade}><Text style={styles.upgradeText}>Unlock Memory Center</Text></Pressable><Pressable onPress={onPrivacy} style={styles.privacyLink}><ShieldCheck size={16} color={colors.textSecondary}/><Text style={styles.privacyLinkText}>Review privacy controls</Text></Pressable></FrostedSurface>;}

function MemoryJournalControls({visible,desktop,query,category,sort,counts,total,canSelect,onClose,onQuery,onCategory,onSort,onSelect,onPrivacy}:{visible:boolean;desktop:boolean;query:string;category:MemoryCenterCategory;sort:MemoryCenterSort;counts:Record<string,number>;total:number;canSelect:boolean;onClose:()=>void;onQuery:(value:string)=>void;onCategory:(value:MemoryCenterCategory)=>void;onSort:(value:MemoryCenterSort)=>void;onSelect:()=>void;onPrivacy:()=>void}){
  const insets=useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={[styles.modalRoot,desktop?styles.modalCentered:styles.modalBottom]}><Pressable accessibilityLabel="Close memory controls" onPress={onClose} style={StyleSheet.absoluteFill}/><FrostedSurface intensity={96} style={[styles.controlsSheet,{paddingBottom:Math.max(20,insets.bottom)},desktop&&styles.controlsSheetDesktop]}><View style={styles.sheetHeader}><View><Text style={styles.sheetKicker}>MEMORY JOURNAL</Text><Text style={styles.sheetTitle}>Find and organize</Text></View><Pressable accessibilityLabel="Close" onPress={onClose} style={styles.sheetClose}><X size={20} color={colors.muted}/></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.controlsContent}>
    <View style={styles.search}><Search size={18} color={colors.muted}/><TextInput accessibilityLabel="Search memories" value={query} onChangeText={onQuery} placeholder="Search memories or places" placeholderTextColor={colors.dimmed} style={styles.searchInput}/>{query?<Pressable accessibilityLabel="Clear search" onPress={()=>onQuery('')} style={styles.clearSearch}><X size={16} color={colors.muted}/></Pressable>:null}</View>
    <View style={styles.controlSection}><Text style={styles.controlLabel}>CATEGORY</Text><View style={styles.optionGrid}>{MEMORY_CATEGORY_OPTIONS.map((option)=>{const count=memoryCategoryCount(option.key,counts,total);return <Pressable key={option.key} onPress={()=>onCategory(option.key)} style={[styles.option,category===option.key&&styles.optionActive]}><Text style={[styles.optionText,category===option.key&&styles.optionTextActive]}>{option.label}</Text><Text style={styles.optionCount}>{count}</Text></Pressable>;})}</View></View>
    <View style={styles.controlSection}><Text style={styles.controlLabel}>SORT BY</Text><View style={styles.optionGrid}>{SORTS.map((option)=><Pressable key={option.key} onPress={()=>onSort(option.key)} style={[styles.option,sort===option.key&&styles.optionActive]}><Text style={[styles.optionText,sort===option.key&&styles.optionTextActive]}>{option.label}</Text></Pressable>)}</View></View>
    <View style={styles.sheetActions}>{canSelect?<Pressable onPress={onSelect} style={styles.sheetAction}><CheckSquare size={18} color={colors.textSecondary}/><Text style={styles.sheetActionText}>Select memories</Text><ChevronDown size={17} color={colors.dimmed} style={styles.actionChevron}/></Pressable>:null}<Pressable onPress={onPrivacy} style={styles.sheetAction}><ShieldCheck size={18} color={colors.violet}/><Text style={styles.sheetActionText}>Memory controls</Text><ChevronDown size={17} color={colors.dimmed} style={styles.actionChevron}/></Pressable></View>
    <Pressable onPress={onClose} style={styles.showResults}><Text style={styles.showResultsText}>Show memories</Text></Pressable>
  </ScrollView></FrostedSurface></View></Modal>;
}

function MemoryCompanionPicker({visible,desktop,companions,activeId,counts,onClose,onChoose}:{visible:boolean;desktop:boolean;companions:CharacterInstance[];activeId?:string;counts:Record<string,number>;onClose:()=>void;onChoose:(companion:CharacterInstance)=>void}){
  const[query,setQuery]=useState('');
  const insets=useSafeAreaInsets();
  useEffect(()=>{if(!visible)setQuery('');},[visible]);
  const filtered=useMemo(()=>companions.filter((item)=>item.together_character_templates.name.toLowerCase().includes(query.trim().toLowerCase())),[companions,query]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={[styles.modalRoot,desktop?styles.modalCentered:styles.modalBottom]}><Pressable accessibilityLabel="Close companion picker" onPress={onClose} style={StyleSheet.absoluteFill}/><FrostedSurface intensity={96} style={[styles.companionSheet,{paddingBottom:Math.max(20,insets.bottom)},desktop&&styles.controlsSheetDesktop]}><View style={styles.sheetHeader}><View><Text style={styles.sheetKicker}>SHARED HISTORY</Text><Text style={styles.sheetTitle}>Choose a companion</Text></View><Pressable accessibilityLabel="Close" onPress={onClose} style={styles.sheetClose}><X size={20} color={colors.muted}/></Pressable></View>{companions.length>6?<View style={styles.search}><Search size={18} color={colors.muted}/><TextInput value={query} onChangeText={setQuery} placeholder="Find someone" placeholderTextColor={colors.dimmed} style={styles.searchInput}/></View>:null}<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.companionList}>{filtered.map((item)=>{const selected=item.id===activeId;return <Pressable key={item.id} accessibilityRole="button" accessibilityState={{selected}} onPress={()=>onChoose(item)} style={[styles.companionOption,selected&&styles.companionOptionActive]}><CharacterAvatar slug={item.together_character_templates.slug} name={item.together_character_templates.name} template={item.together_character_templates} version={item.together_character_versions} size={48}/><View style={styles.companionOptionCopy}><Text numberOfLines={1} style={[styles.companionOptionName,selected&&styles.optionTextActive]}>{item.together_character_templates.name}</Text><Text style={styles.companionOptionCount}>{counts[item.id]??0} remembered</Text></View>{selected?<View style={styles.selectedMark}><Text style={styles.selectedMarkText}>✓</Text></View>:null}</Pressable>;})}</ScrollView></FrostedSurface></View></Modal>;
}

const styles=StyleSheet.create({
  page:{flex:1,maxWidth:960,paddingHorizontal:0,paddingTop:0,paddingBottom:0,backgroundColor:'#09070D',overflow:'hidden'},roseGlow:{position:'absolute',left:'-18%',bottom:'-18%',width:'72%',height:'68%',borderRadius:999,backgroundColor:'rgba(104,18,82,.20)'},violetGlow:{position:'absolute',right:'-22%',top:'-10%',width:'62%',height:'58%',borderRadius:999,backgroundColor:'rgba(92,43,142,.13)'},topBar:{zIndex:5,minHeight:70,flexDirection:'row',alignItems:'center',paddingHorizontal:spacing.lg,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.045)'},topIcon:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},topTitle:{flex:1,color:colors.text,fontSize:18,fontWeight:'800',paddingHorizontal:10},activeDot:{position:'absolute',right:7,top:7,width:7,height:7,borderRadius:4,backgroundColor:'#E49BCB',borderWidth:1,borderColor:'#09070D'},pressed:{opacity:.72},journal:{flex:1,minHeight:0},listContent:{width:'100%',maxWidth:820,alignSelf:'center',paddingHorizontal:spacing.lg,paddingBottom:40},emptyContent:{flexGrow:1},hero:{paddingTop:28,paddingBottom:25},heroDesktop:{paddingTop:42,paddingBottom:30},heroIdentity:{flexDirection:'row',alignItems:'flex-start',gap:20},heroIdentityCompact:{gap:14},heroCopy:{flex:1,minWidth:0,paddingTop:1},companionPicker:{alignSelf:'flex-start',maxWidth:'100%',minHeight:42,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:15,borderRadius:radius.pill,backgroundColor:'rgba(27,21,31,.76)',borderWidth:1,borderColor:'rgba(223,166,205,.24)'},companionPickerSingle:{paddingHorizontal:0,borderWidth:0,backgroundColor:'transparent'},companionPickerText:{flexShrink:1,color:colors.text,fontSize:15,fontWeight:'900'},sharedHistory:{color:'#B8A8B7',fontSize:13,marginTop:9},heroTitle:{maxWidth:540,color:colors.text,fontFamily:typography.display,fontSize:38,lineHeight:41,fontWeight:'700',letterSpacing:-.65,marginTop:17},heroTitleCompact:{fontSize:33,lineHeight:35,letterSpacing:-.4,marginTop:14},heroTitleDesktop:{fontSize:48,lineHeight:50,letterSpacing:-1},heroSubtitle:{color:'#B9AFB9',fontSize:15,lineHeight:22,marginTop:10},addMemory:{minHeight:76,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:15,paddingHorizontal:20,borderRadius:22,backgroundColor:'#DA91C0',shadowColor:'#B24F94',shadowOpacity:.2,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:3},addMemoryPressed:{opacity:.88,transform:[{scale:.992}]},addMemoryText:{color:'#100A12',fontSize:18,fontWeight:'900'},errorCard:{minHeight:48,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14,borderRadius:radius.md,backgroundColor:'rgba(255,107,121,.08)',borderWidth:1,borderColor:'rgba(255,107,121,.22)',marginTop:18},errorText:{flex:1,color:colors.danger,fontSize:13},retryText:{color:'#F0A1D0',fontWeight:'900',fontSize:12},listHeader:{minHeight:80,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',gap:18,paddingTop:31,paddingBottom:14},listTitle:{flex:1,color:colors.text,fontFamily:typography.display,fontSize:27,lineHeight:32,fontWeight:'700'},listCount:{color:colors.muted,fontSize:13,paddingBottom:3},loading:{minHeight:260,alignItems:'center',justifyContent:'center',gap:12},loadingMore:{paddingVertical:20,alignItems:'center',gap:8},muted:{color:colors.muted,fontSize:13},journalFooter:{gap:18,paddingTop:18,paddingBottom:48},trustDivider:{height:1,backgroundColor:'rgba(255,255,255,.07)',marginTop:4},trustText:{color:colors.dimmed,fontSize:12,textAlign:'center'},lockedScroll:{width:'100%',maxWidth:820,alignSelf:'center',paddingHorizontal:spacing.lg,paddingBottom:48},locked:{minHeight:340,alignItems:'center',justifyContent:'center',padding:30,borderRadius:radius.xl,backgroundColor:'rgba(31,23,39,.84)',borderColor:'rgba(190,115,255,.24)'},lockIcon:{width:60,height:60,borderRadius:30,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(168,69,242,.17)'},lockMini:{position:'absolute',right:-1,bottom:-1,width:23,height:23,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:colors.violet},lockedKicker:{color:'#D8A5FF',fontSize:10,fontWeight:'900',letterSpacing:1.3,marginTop:17},lockedTitle:{color:colors.text,fontFamily:typography.display,fontSize:27,fontWeight:'700',textAlign:'center',marginTop:7},lockedCopy:{maxWidth:480,color:colors.textSecondary,fontSize:14,lineHeight:21,textAlign:'center',marginTop:8},upgrade:{minHeight:50,minWidth:230,alignItems:'center',justifyContent:'center',paddingHorizontal:18,borderRadius:radius.md,backgroundColor:'#9D42E4',marginTop:19},upgradeText:{color:'#fff',fontSize:13,fontWeight:'900'},privacyLink:{flexDirection:'row',alignItems:'center',gap:7,marginTop:13,padding:9},privacyLinkText:{color:colors.textSecondary,fontSize:12,fontWeight:'800'},modalRoot:{flex:1,backgroundColor:'rgba(3,2,7,.74)',padding:spacing.lg},modalCentered:{alignItems:'center',justifyContent:'center'},modalBottom:{justifyContent:'flex-end',paddingHorizontal:0,paddingBottom:0},controlsSheet:{width:'100%',maxHeight:'90%',padding:20,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,backgroundColor:'rgba(23,18,29,.98)',borderColor:'rgba(225,146,198,.20)'},controlsSheetDesktop:{maxWidth:620,borderRadius:radius.xl},companionSheet:{width:'100%',maxHeight:'84%',padding:20,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,backgroundColor:'rgba(23,18,29,.98)',borderColor:'rgba(225,146,198,.20)'},sheetHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:14},sheetKicker:{color:'#E09AC7',fontSize:9,fontWeight:'900',letterSpacing:1.25},sheetTitle:{color:colors.text,fontFamily:typography.display,fontSize:25,fontWeight:'700',marginTop:3},sheetClose:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.045)'},controlsContent:{gap:20,paddingTop:18,paddingBottom:4},search:{minHeight:50,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:14,borderRadius:radius.md,backgroundColor:'rgba(5,5,9,.48)',borderWidth:1,borderColor:colors.border},searchInput:{flex:1,minWidth:0,color:colors.text,fontSize:15},clearSearch:{width:34,height:34,alignItems:'center',justifyContent:'center'},controlSection:{gap:10},controlLabel:{color:colors.dimmed,fontSize:10,fontWeight:'900',letterSpacing:1.2},optionGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},option:{minHeight:42,flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:13,borderRadius:radius.pill,backgroundColor:'rgba(255,255,255,.035)',borderWidth:1,borderColor:colors.border},optionActive:{backgroundColor:'rgba(216,62,234,.13)',borderColor:'rgba(225,146,198,.55)'},optionText:{color:colors.muted,fontSize:12,fontWeight:'800'},optionTextActive:{color:colors.text},optionCount:{color:colors.dimmed,fontSize:10,fontWeight:'900'},sheetActions:{gap:8,paddingTop:4,borderTopWidth:1,borderTopColor:colors.border},sheetAction:{minHeight:52,flexDirection:'row',alignItems:'center',gap:11,paddingHorizontal:12,borderRadius:radius.md,backgroundColor:'rgba(255,255,255,.025)'},sheetActionText:{flex:1,color:colors.textSecondary,fontSize:13,fontWeight:'800'},actionChevron:{transform:[{rotate:'-90deg'}]},showResults:{minHeight:52,alignItems:'center',justifyContent:'center',borderRadius:radius.md,backgroundColor:'#D987BB'},showResultsText:{color:'#130B13',fontSize:14,fontWeight:'900'},companionList:{gap:8,paddingTop:16,paddingBottom:5},companionOption:{minHeight:66,flexDirection:'row',alignItems:'center',gap:12,padding:9,borderRadius:radius.lg,borderWidth:1,borderColor:'transparent'},companionOptionActive:{backgroundColor:'rgba(216,62,234,.10)',borderColor:'rgba(225,146,198,.32)'},companionOptionCopy:{flex:1,minWidth:0},companionOptionName:{color:colors.textSecondary,fontSize:15,fontWeight:'900'},companionOptionCount:{color:colors.muted,fontSize:11,marginTop:3},selectedMark:{width:26,height:26,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#D987BB'},selectedMarkText:{color:'#160B14',fontWeight:'900'}
});
