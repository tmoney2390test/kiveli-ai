import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, LifeBuoy, Plus, RefreshCw } from 'lucide-react-native';
import { GradientButton, Screen } from '../../components/ui';
import {
  loadMySupportTicket,
  loadMySupportTickets,
  markSupportRead,
  type SupportCursor,
} from '../../lib/operations';
import { formatSupportTicketReference } from '../../lib/supportTicket';
import { supportStatusLabel } from '../../lib/supportRecovery';
import { colors } from '../../theme';
import { SupportComposer, type SupportParams } from './SupportComposer';
import { SupportScreenshotGallery } from './SupportScreenshotGallery';
import { supportStyles as s } from './styles';

export function SupportScreen({ userId }: { userId?: string }) {
  const params = useLocalSearchParams<SupportParams>(),
    client = useQueryClient(),
    scroll = useRef<ScrollView>(null);
  const [mode, setMode] = useState<'inbox' | 'new' | 'detail'>(
    params.ticket ? 'detail' : params.topic || params.mode === 'new' ? 'new' : 'inbox',
  );
  const [ticketId, setTicketId] = useState(params.ticket ?? ''),
    [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all'),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [notice, setNotice] = useState(''),
    [mailError, setMailError] = useState('');
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
      if (state === 'active') void client.invalidateQueries({ queryKey: ['support', userId] });
    });
    return () => listener.remove();
  }, [userId, client]);
  useEffect(() => {
    const timeout = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    if (params.ticket) {
      setTicketId(params.ticket);
      setMode('detail');
    } else if (params.mode === 'new' || params.topic) setMode('new');
  }, [params.ticket, params.mode, params.topic]);
  const inbox = useInfiniteQuery({
    queryKey: ['support', userId, 'inbox', filter, query],
    queryFn: ({ pageParam }) =>
      loadMySupportTickets({ filter, search: query, ...pageParam, expectedUserId: userId }),
    initialPageParam: {} as Partial<SupportCursor>,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!userId && mode === 'inbox',
    staleTime: 15000,
    refetchInterval: active && mode === 'inbox' ? 30000 : false,
    retry: 1,
  });
  const detail = useQuery({
    queryKey: ['support', userId, 'ticket', ticketId],
    queryFn: () => loadMySupportTicket(ticketId, userId),
    enabled: !!userId && !!ticketId && mode === 'detail',
    staleTime: 0,
    refetchInterval: active && mode === 'detail' ? 30000 : false,
    retry: 1,
  });
  const data = detail.data, counts = inbox.data?.pages[0]?.counts;
  const readThrough = useRef('');
  useEffect(() => {
    if (!active || mode !== 'detail' || !data) return;
    const through = data.replies.filter((reply) => reply.sender === 'support').at(-1)?.created_at;
    if (!through || readThrough.current === `${data.ticket.id}:${through}`) return;
    const key = `${data.ticket.id}:${through}`;
    readThrough.current = key;
    void markSupportRead(data.ticket.id, through, userId).then(() =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['support', userId, 'unread'] }),
        client.invalidateQueries({ queryKey: ['support', userId, 'inbox'] }),
      ])
    ).catch(() => {
      if (readThrough.current === key) readThrough.current = '';
    });
  }, [data, mode, active, userId, client]);
  const clearParams = () =>
    router.setParams({
      ticket: undefined,
      mode: undefined,
      topic: undefined,
      mediaId: undefined,
      conversationId: undefined,
      messageId: undefined,
      correlationId: undefined,
      errorCode: undefined,
      purchaseReference: undefined,
    });
  const open = (id: string) => {
    setTicketId(id);
    setMode('detail');
    setNotice('');
    router.setParams({ ticket: id, mode: undefined, topic: undefined });
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const sent = (id: string) => {
    if (mode === 'detail' && ticketId === id) setNotice('Reply sent.');
    else {
      open(id);
      setNotice('Saved. You can follow replies here.');
    }
    void client.invalidateQueries({ queryKey: ['support', userId] });
  };
  const back = () => {
    if (mode !== 'inbox') {
      setMode('inbox');
      setNotice('');
      clearParams();
      scroll.current?.scrollTo({ y: 0, animated: false });
    } else if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };
  const current = mode === 'detail' ? detail : inbox;
  if (!userId) {
    return (
      <Screen contentStyle={s.content}>
        <Text style={s.title}>Support</Text>
        <Text style={s.text}>Sign in to see your requests and replies.</Text>
        <GradientButton label='Sign in' onPress={() => router.push('/auth?mode=signin')} />
      </Screen>
    );
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen scrollRef={scroll} contentStyle={s.content} keyboardShouldPersistTaps='handled'>
        <View style={s.header}>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={mode === 'inbox' ? 'Go back' : 'Back to support inbox'}
            style={s.icon}
            onPress={back}
          >
            <ArrowLeft color={colors.text} />
          </Pressable>
          <View style={s.heading}>
            <Text style={s.title}>
              {mode === 'new' ? 'New request' : mode === 'detail' ? 'Request' : 'Support'}
            </Text>
            {mode === 'inbox' ? <Text style={s.meta}>Your requests, all in one place.</Text> : null}
          </View>
          {mode !== 'new'
            ? (
              <Pressable
                accessibilityRole='button'
                accessibilityLabel='Refresh support requests'
                style={s.icon}
                onPress={() => void current.refetch()}
              >
                <RefreshCw size={20} color={colors.text} />
              </Pressable>
            )
            : null}
        </View>
        {notice ? <Text accessibilityLiveRegion='polite' style={s.text}>{notice}</Text> : null}
        {mode === 'new' ? <SupportComposer key='new' params={params} onSent={sent} /> : (
          <>
            {current.error
              ? (
                <View style={s.card}>
                  <Text accessibilityRole='alert' style={s.error}>
                    {current.error instanceof Error
                      ? current.error.message
                      : 'Support could not be loaded.'}
                  </Text>
                  <Pressable
                    accessibilityRole='button'
                    onPress={() => void current.refetch()}
                    style={s.action}
                  >
                    <Text style={s.link}>Try again</Text>
                  </Pressable>
                </View>
              )
              : null}
            {current.isPending
              ? (
                <ActivityIndicator
                  accessibilityLabel='Loading support requests'
                  color={colors.violet}
                />
              )
              : null}
            {mode === 'inbox'
              ? (
                <>
                  <GradientButton
                    label='New request'
                    icon={<Plus color='#fff' size={20} />}
                    onPress={() => {
                      setMode('new');
                      setNotice('');
                      router.setParams({ mode: 'new', topic: undefined, ticket: undefined });
                    }}
                  />
                  <View style={s.row}>
                    {(['all', 'open', 'resolved'] as const).map((value) => (
                      <Pressable
                        key={value}
                        accessibilityRole='tab'
                        accessibilityState={{ selected: filter === value }}
                        style={[s.pill, filter === value && s.active]}
                        onPress={() => setFilter(value)}
                      >
                        <Text style={s.label}>
                          {value === 'all'
                            ? 'All'
                            : value === 'open'
                            ? `Open${counts ? ` · ${counts.open}` : ''}`
                            : `Resolved${counts ? ` · ${counts.resolved}` : ''}`}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    accessibilityLabel='Search support requests'
                    value={search}
                    onChangeText={setSearch}
                    maxLength={160}
                    placeholder='Search subject or request number'
                    placeholderTextColor={colors.dimmed}
                    style={s.input}
                  />
                  {inbox.data?.pages.flatMap((page) => page.tickets).filter((row, index, all) =>
                    all.findIndex((other) => other.id === row.id) === index
                  ).map((ticket) => (
                    <Pressable
                      key={ticket.id}
                      accessibilityRole='button'
                      accessibilityLabel={`${
                        ticket.unread ? 'New reply. ' : ''
                      }${ticket.subject}, ${formatSupportTicketReference(ticket.ticket_number)}`}
                      style={[s.card, ticket.unread && s.staff]}
                      onPress={() => open(ticket.id)}
                    >
                      <View style={s.spread}>
                        <Text style={[s.label, { flex: 1 }]}>{ticket.subject}</Text>
                        <ChevronRight size={18} color={colors.muted} />
                      </View>
                      <View style={s.row}>
                        <Text style={s.meta}>
                          {formatSupportTicketReference(ticket.ticket_number)} ·{' '}
                          {supportStatusLabel(ticket.status)}
                        </Text>
                        {ticket.unread
                          ? (
                            <View style={s.badge}>
                              <Text style={s.badgeText}>New reply</Text>
                            </View>
                          )
                          : null}
                      </View>
                      <Text style={s.meta}>
                        Updated {new Date(ticket.updated_at).toLocaleDateString()}
                      </Text>
                    </Pressable>
                  ))}
                  {!inbox.isPending && !inbox.error &&
                      !inbox.data?.pages.some((page) => page.tickets.length)
                    ? (
                      <View style={s.empty}>
                        <LifeBuoy size={32} color={colors.violet} />
                        <Text style={s.subtitle}>
                          {query
                            ? 'No matching requests'
                            : filter === 'all'
                            ? 'Need a hand?'
                            : `No ${filter} requests`}
                        </Text>
                        <Text style={s.meta}>
                          {query
                            ? 'Try another subject or request number.'
                            : 'Send a request and follow the conversation here.'}
                        </Text>
                      </View>
                    )
                    : null}
                  {inbox.hasNextPage
                    ? (
                      <GradientButton
                        label={inbox.isFetchingNextPage ? 'Loading…' : 'Load older requests'}
                        disabled={inbox.isFetchingNextPage}
                        onPress={() => void inbox.fetchNextPage()}
                      />
                    )
                    : null}
                  <Pressable
                    accessibilityRole='button'
                    style={s.action}
                    onPress={() => router.push('/help')}
                  >
                    <Text style={s.link}>Browse help & recovery</Text>
                  </Pressable>
                </>
              )
              : data
              ? (
                <>
                  <Text style={s.subtitle}>{data.ticket.subject}</Text>
                  <Text style={s.meta}>
                    {formatSupportTicketReference(data.ticket.ticket_number)} ·{' '}
                    {supportStatusLabel(data.ticket.status)}
                  </Text>
                  <View style={s.card}>
                    <Text style={s.label}>Your request</Text>
                    <Text selectable style={s.text}>{data.ticket.message}</Text>
                    <SupportScreenshotGallery
                      attachments={data.attachments?.filter((item) => !item.replyId) ?? []}
                    />
                    <Text style={s.meta}>{new Date(data.ticket.created_at).toLocaleString()}</Text>
                  </View>
                  {data.replies.map((reply) => (
                    <View key={reply.id} style={[s.card, reply.sender === 'support' && s.staff]}>
                      <Text style={s.label}>
                        {reply.sender === 'support' ? 'Kivelli Support' : 'You'}
                      </Text>
                      <Text selectable style={s.text}>{reply.message}</Text>
                      <SupportScreenshotGallery
                        attachments={data.attachments?.filter((item) =>
                          item.replyId === reply.id
                        ) ?? []}
                      />
                      <Text style={s.meta}>{new Date(reply.created_at).toLocaleString()}</Text>
                    </View>
                  ))}
                  {['closed', 'resolved'].includes(data.ticket.status)
                    ? <Text style={s.meta}>Sending a reply reopens this request.</Text>
                    : null}
                  <SupportComposer key={ticketId} ticketId={ticketId} onSent={sent} />
                </>
              )
              : null}
          </>
        )}
        <Pressable
          accessibilityRole='link'
          style={s.action}
          onPress={() => {
            setMailError('');
            void Linking.openURL('mailto:support@kivelli.app').catch(() =>
              setMailError('Email support@kivelli.app from your email app.')
            );
          }}
        >
          <Text style={s.link}>Prefer email? support@kivelli.app</Text>
        </Pressable>
        {mailError ? <Text style={s.error}>{mailError}</Text> : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
