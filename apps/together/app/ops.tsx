import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  DollarSign,
  FileClock,
  ImageIcon,
  MessageSquareWarning,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Siren,
  Users,
} from "lucide-react-native";
import { colors, radius, typography } from "../src/theme";
import {
  evaluateOperationsAlerts,
  invalidateOperationsSessions,
  loadOperationsDashboard,
  loadSupportTicket,
  lookupOperationsUser,
  type OperationsAlertRule,
  type OperationsDashboard,
  type OperationsIncident,
  type OperationsQueue,
  type OperationsUserLookup,
  refundOperationsCredit,
  retryOperationsMedia,
  updateOperationsAlertRule,
  updateOperationsIncident,
  updateSupportTicket,
} from "../src/lib/operations";
import { useAuth } from "../src/hooks/useAuth";

type Tab =
  | "overview"
  | "queues"
  | "incidents"
  | "support"
  | "users"
  | "alerts"
  | "releases"
  | "audit";
const tabs: Array<{ key: Tab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "queues", label: "Queues" },
  { key: "incidents", label: "Incidents" },
  { key: "support", label: "Support" },
  { key: "users", label: "Users" },
  { key: "alerts", label: "Alerts" },
  { key: "releases", label: "Releases" },
  { key: "audit", label: "Audit" },
];
const metricDefinitions: Array<
  {
    key: string;
    label: string;
    icon: React.ReactNode;
    format?: (value: number) => string;
  }
> = [
  {
    key: "clientErrors24h",
    label: "Client errors · 24h",
    icon: <AlertTriangle color={colors.warm} />,
  },
  {
    key: "openSupportTickets",
    label: "Open support",
    icon: <MessageSquareWarning color={colors.violet} />,
  },
  {
    key: "newAccounts24h",
    label: "New accounts · 24h",
    icon: <Users color={colors.success} />,
  },
  {
    key: "mediaActive",
    label: "Media processing",
    icon: <ImageIcon color={colors.rose} />,
  },
  {
    key: "mediaStale",
    label: "Stale media jobs",
    icon: <Clock3 color={colors.warm} />,
  },
  {
    key: "failedCalls24h",
    label: "Failed calls · 24h",
    icon: <Phone color={colors.rose} />,
  },
  {
    key: "pushFailures24h",
    label: "Push failures · 24h",
    icon: <Send color={colors.warm} />,
  },
  {
    key: "aiP95LatencyMs",
    label: "AI p95 latency",
    icon: <Activity color={colors.violet} />,
    format: (value) => duration(value / 1000),
  },
  {
    key: "aiSuccessRate",
    label: "AI success · 24h",
    icon: <CheckCircle2 color={colors.success} />,
    format: (value) => `${(value * 100).toFixed(1)}%`,
  },
  {
    key: "providerCost24h",
    label: "Provider cost · 24h",
    icon: <DollarSign color={colors.success} />,
    format: (value) => `$${value.toFixed(2)}`,
  },
];

export default function Operations() {
  const { width } = useWindowDimensions(),
    { session } = useAuth(),
    [data, setData] = useState<OperationsDashboard | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [tab, setTab] = useState<Tab>("overview"),
    [userResult, setUserResult] = useState<OperationsUserLookup | null>(null),
    [userQuery, setUserQuery] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [ticketDetail, setTicketDetail] = useState<
      {
        ticket: Record<string, unknown>;
        events: Array<Record<string, unknown>>;
      } | null
    >(null),
    [note, setNote] = useState(""),
    [busyKey, setBusyKey] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadOperationsDashboard());
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Operations could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const mutate = async (
    key: string,
    run: () => Promise<unknown>,
    refresh = true,
  ) => {
    setBusyKey(key);
    setError("");
    try {
      await run();
      if (refresh) await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "That operation could not be completed.",
      );
    } finally {
      setBusyKey("");
    }
  };
  const searchUser = async () => {
    if (!userQuery.trim()) return;
    setBusyKey("lookup");
    setError("");
    try {
      setUserResult(await lookupOperationsUser(userQuery.trim()));
      setConfirmed(false);
      setReason("");
    } catch (caught) {
      setUserResult(null);
      setError(
        caught instanceof Error ? caught.message : "Account lookup failed.",
      );
    } finally {
      setBusyKey("");
    }
  };
  const openTicket = async (id: string) => {
    setBusyKey(`ticket:${id}`);
    try {
      setTicketDetail(await loadSupportTicket(id));
      setNote("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Ticket could not be opened.",
      );
    } finally {
      setBusyKey("");
    }
  };
  const sensitive = (key: string, run: () => Promise<unknown>) => {
    if (!confirmed) {
      setError("Confirm the exact-account action first.");
      return;
    }
    if (reason.trim().length < 8) {
      setError("Add a support reason with at least 8 characters.");
      return;
    }
    void mutate(key, run).then(() => {
      setConfirmed(false);
      setReason("");
      if (userQuery) void searchUser();
    });
  };
  if (!data && loading) return <Loading label="Loading private telemetry…" />;
  if (!data) {
    return (
      <Loading
        label={error || "Operations could not be loaded."}
        retry={() => void load()}
      />
    );
  }
  const visibleTabs = tabs.filter((item) =>
      item.key !== "audit" || data.access.permissions.admin
    ),
    compact = width < 840;
  return (
    <View style={styles.page}>
      <View style={styles.glow} />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')}
          style={styles.iconButton}
        >
          <ArrowLeft color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>
            PRIVATE OPERATIONS · {data.access.role.toUpperCase()}
          </Text>
          <Text accessibilityRole="header" style={styles.title}>
            Kivelle control room
          </Text>
          <Text style={styles.subtitle}>
            Reliability, incidents, support, and safe recovery—without
            conversation content.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh"
          disabled={loading}
          onPress={() => void load()}
          style={styles.iconButton}
        >
          {loading
            ? <ActivityIndicator size="small" color={colors.violet} />
            : <RefreshCw size={18} color={colors.text} />}
        </Pressable>
      </View>
      <View style={styles.tabShell}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {visibleTabs.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={[styles.tab, tab === item.key && styles.tabActive]}
            >
              <Text
                style={[
                  styles.tabText,
                  tab === item.key && styles.tabTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {error
          ? (
            <View style={styles.errorBanner}>
              <AlertTriangle size={17} color={colors.warm} />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => setError("")}>
                <Text style={styles.dismiss}>Dismiss</Text>
              </Pressable>
            </View>
          )
          : null}
        {tab === "overview" ? <Overview data={data} compact={compact} /> : null}
        {tab === "queues"
          ? <Queues queues={data.queues} providers={data.providerHealth} />
          : null}
        {tab === "incidents"
          ? (
            <Incidents
              incidents={data.incidents}
              canMutate={data.access.permissions.support}
              busyKey={busyKey}
              mutate={mutate}
            />
          )
          : null}
        {tab === "support"
          ? (
            <Support
              data={data}
              detail={ticketDetail}
              note={note}
              setNote={setNote}
              busyKey={busyKey}
              openTicket={openTicket}
              closeDetail={() => setTicketDetail(null)}
              mutate={mutate}
              actorId={session?.user.id ?? null}
            />
          )
          : null}
        {tab === "users"
          ? (
            <UsersPanel
              result={userResult}
              query={userQuery}
              setQuery={setUserQuery}
              search={searchUser}
              busyKey={busyKey}
              reason={reason}
              setReason={setReason}
              confirmed={confirmed}
              setConfirmed={setConfirmed}
              admin={data.access.permissions.admin}
              sensitive={sensitive}
            />
          )
          : null}
        {tab === "alerts"
          ? (
            <Alerts
              rules={data.alertRules}
              events={data.alertEvents}
              configuration={data.alertConfiguration}
              admin={data.access.permissions.admin}
              busyKey={busyKey}
              mutate={mutate}
            />
          )
          : null}
        {tab === "releases" ? <Releases data={data} /> : null}
        {tab === "audit" ? <Audit rows={data.audit} /> : null}
        <Text style={styles.note}>{data.note}</Text>
      </ScrollView>
    </View>
  );
}

function Overview(
  { data, compact }: { data: OperationsDashboard; compact: boolean },
) {
  return (
    <>
      <View style={styles.health}>
        <View
          style={[
            styles.healthDot,
            data.health.status === "healthy" ? styles.good : styles.attention,
          ]}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.healthTitle}>
            {data.health.status === "healthy"
              ? "Systems look healthy"
              : "Operations need attention"}
          </Text>
          <Text style={styles.muted}>
            {data.health.openIncidents} open incidents ·{" "}
            {data.health.criticalIncidents} critical · generated{" "}
            {new Date(data.generatedAt).toLocaleString()}
          </Text>
        </View>
      </View>
      <View style={styles.metrics}>
        {metricDefinitions.map((item) => (
          <View
            key={item.key}
            style={[styles.metric, compact && styles.metricCompact]}
          >
            <View style={styles.metricIcon}>{item.icon}</View>
            <Text style={styles.metricValue}>
              {item.format
                ? item.format(Number(data.metrics[item.key] ?? 0))
                : Number(data.metrics[item.key] ?? 0).toLocaleString()}
            </Text>
            <Text style={styles.metricLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.columns, compact && styles.columnsStack]}>
        <Panel
          title="Active incidents"
          hint="Grouped by safe fingerprint or alert rule."
        >
          {data.incidents.filter((item) => item.status !== "resolved").slice(
            0,
            8,
          ).map((incident) => (
            <IncidentLine key={incident.id} incident={incident} />
          ))}
        </Panel>
        <Panel
          title="Recent client errors"
          hint="Sanitized route, version, and correlation only."
        >
          {data.recentErrors.slice(0, 10).map((row) => (
            <RecordLine
              key={String(row.id)}
              title={`${String(row.error_name)} · ${String(row.route)}`}
              body={String(row.message_safe)}
              meta={`${date(row.created_at)} · ${String(row.platform ?? "unknown")} · ${
                String(row.app_version ?? "unknown")
              }`}
            />
          ))}
        </Panel>
      </View>
      <Panel
        title="Client surface performance"
        hint="Measured end-to-end on real app requests; no message or prompt content is collected."
      >
        {data.clientPerformance.slice(0,12).map((surface)=><View key={`${surface.surface}:${surface.operation}`} style={styles.providerRow}>
          <View style={{flex:1}}><Text style={styles.recordTitle}>{surface.surface}</Text><Text style={styles.recordMeta}>{surface.operation} · {surface.requests} requests · {surface.failures} failed</Text></View>
          <Text style={surface.successRate<.95?styles.badValue:styles.goodValue}>{(surface.successRate*100).toFixed(1)}%</Text>
          <Text style={styles.providerMetric}>p50 {duration(surface.p50DurationMs/1000)}</Text>
          <Text style={styles.providerMetric}>p95 {duration(surface.p95DurationMs/1000)}</Text>
        </View>)}
        {!data.clientPerformance.length?<Text style={styles.muted}>Client timing samples will appear after the instrumented app reaches users.</Text>:null}
      </Panel>
    </>
  );
}

function Queues(
  { queues, providers }: {
    queues: OperationsQueue[];
    providers: OperationsDashboard["providerHealth"];
  },
) {
  return (
    <>
      <SectionHeader
        icon={<Activity color={colors.violet} />}
        title="Queue health"
        body="Current work, oldest request age, failures, and state distribution."
      />
      <View style={styles.queueGrid}>
        {queues.map((queue) => (
          <View
            key={queue.key}
            style={[
              styles.queueCard,
              Boolean(queue.stale || queue.failed24h) && styles.queueAttention,
            ]}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.panelTitle}>{queue.label}</Text>
              <StatusPill
                value={queue.stale
                  ? "stale"
                  : queue.active
                  ? "working"
                  : "clear"}
              />
            </View>
            <View style={styles.queueNumbers}>
              <Stat label="ACTIVE" value={queue.active} />
              <Stat
                label="OLDEST"
                value={queue.oldestAgeSeconds
                  ? duration(queue.oldestAgeSeconds)
                  : "—"}
              />
              <Stat label="FAILED · 24H" value={queue.failed24h} />
            </View>
            <View style={styles.statusRow}>
              {queue.statuses.map((item) => (
                <Text key={item.status} style={styles.statusText}>
                  {item.status} {item.count}
                </Text>
              ))}
            </View>
            {queue.oldest?.provider
              ? (
                <Text style={styles.recordMeta}>
                  {queue.oldest.provider} ·{" "}
                  {queue.oldest.model ?? "default model"}
                </Text>
              )
              : null}
          </View>
        ))}
      </View>
      <Panel
        title="Provider health · 24h"
        hint="Dialogue and media success, latency, volume, and estimated cost."
      >
        {providers.map((provider) => (
          <View
            key={`${provider.modality}:${provider.provider}:${provider.model}`}
            style={styles.providerRow}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.recordTitle}>
                {provider.provider} · {provider.model}
              </Text>
              <Text style={styles.recordMeta}>
                {provider.modality} · {provider.requests} requests ·{" "}
                {provider.failures} failed
              </Text>
            </View>
            <Text
              style={provider.successRate < .9
                ? styles.badValue
                : styles.goodValue}
            >
              {(provider.successRate * 100).toFixed(1)}%
            </Text>
            <Text style={styles.providerMetric}>
              {duration(provider.p95LatencyMs / 1000)}
            </Text>
            <Text style={styles.providerMetric}>
              ${provider.estimatedCost.toFixed(2)}
            </Text>
          </View>
        ))}
      </Panel>
    </>
  );
}

function Incidents({
  incidents,
  canMutate,
  busyKey,
  mutate,
}: {
  incidents: OperationsIncident[];
  canMutate: boolean;
  busyKey: string;
  mutate: (key: string, run: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <>
      <SectionHeader
        icon={<Siren color={colors.rose} />}
        title="Incident timeline"
        body="Acknowledge, monitor, and resolve grouped production failures."
      />
      <Panel
        title="Incidents"
        hint={`${
          incidents.filter((item) => item.status !== "resolved").length
        } currently active`}
      >
        {incidents.map((incident) => (
          <View key={incident.id} style={styles.incident}>
            <IncidentLine incident={incident} />
            {canMutate && incident.status !== "resolved"
              ? (
                <View style={styles.actionRow}>
                  <SmallAction
                    label="Acknowledge"
                    busy={busyKey === incident.id}
                    onPress={() =>
                      void mutate(incident.id, () =>
                        updateOperationsIncident({
                          incidentId: incident.id,
                          status: "acknowledged",
                        }))}
                  />
                  <SmallAction
                    label="Monitor"
                    busy={busyKey === incident.id}
                    onPress={() =>
                      void mutate(incident.id, () =>
                        updateOperationsIncident({
                          incidentId: incident.id,
                          status: "monitoring",
                        }))}
                  />
                  <SmallAction
                    label="Resolve"
                    busy={busyKey === incident.id}
                    onPress={() =>
                      void mutate(incident.id, () =>
                        updateOperationsIncident({
                          incidentId: incident.id,
                          status: "resolved",
                        }))}
                  />
                </View>
              )
              : null}
          </View>
        ))}
      </Panel>
    </>
  );
}

function Support({
  data,
  detail,
  note,
  setNote,
  busyKey,
  openTicket,
  closeDetail,
  mutate,
  actorId,
}: {
  data: OperationsDashboard;
  detail: {
    ticket: Record<string, unknown>;
    events: Array<Record<string, unknown>>;
  } | null;
  note: string;
  setNote: (value: string) => void;
  busyKey: string;
  openTicket: (id: string) => Promise<void>;
  closeDetail: () => void;
  mutate: (key: string, run: () => Promise<unknown>) => Promise<void>;
  actorId: string | null;
}) {
  if (detail) {
    const ticket = detail.ticket, id = String(ticket.id);
    const update = (
      patch: Partial<{
        status: string;
        priority: string;
        assignedTo: string | null;
        tags: string[];
        note: string;
      }>,
    ) =>
      mutate(
        `ticket:${id}`,
        () => updateSupportTicket({ ticketId: id, ...patch }),
      ).then(async () => {
        await openTicket(id);
      });
    return (
      <>
        <SectionHeader
          icon={<MessageSquareWarning color={colors.violet} />}
          title={String(ticket.subject)}
          body={`${String(ticket.category)} · ${String(ticket.priority)} · ${String(ticket.status)}`}
        />
        <Pressable onPress={closeDetail}>
          <Text style={styles.link}>← Back to support queue</Text>
        </Pressable>
        <Panel
          title="Customer request"
          hint={`${date(ticket.created_at)} · correlation ${
            String(ticket.correlation_id ?? "none")
          }`}
        >
          <Text style={styles.ticketMessage}>{String(ticket.message)}</Text>
          <View style={styles.actionRow}>
            <SmallAction
              label="Assign to me"
              busy={busyKey === `ticket:${id}`}
              disabled={!actorId}
              onPress={() => void update({ assignedTo: actorId })}
            />
            <SmallAction
              label="In progress"
              busy={busyKey === `ticket:${id}`}
              onPress={() => void update({ status: "in_progress" })}
            />
            <SmallAction
              label="Waiting"
              busy={busyKey === `ticket:${id}`}
              onPress={() => void update({ status: "waiting" })}
            />
            <SmallAction
              label="Resolve"
              busy={busyKey === `ticket:${id}`}
              onPress={() => void update({ status: "resolved" })}
            />
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Add a private support note…"
            placeholderTextColor={colors.dimmed}
            style={[styles.input, styles.noteInput]}
          />
          <SmallAction
            label="Save note"
            busy={busyKey === `ticket:${id}`}
            disabled={note.trim().length < 2}
            onPress={() => void update({ note }).then(() => setNote(""))}
          />
        </Panel>
        <Panel
          title="Ticket history"
          hint="Status, assignment, and note audit trail."
        >
          {detail.events.map((event) => (
            <RecordLine
              key={String(event.id)}
              title={String(event.event_type)}
              body={event.note_safe ? String(event.note_safe) : undefined}
              meta={date(event.created_at)}
            />
          ))}
        </Panel>
      </>
    );
  }
  return (
    <>
      <SectionHeader
        icon={<MessageSquareWarning color={colors.violet} />}
        title="Support workflow"
        body="Priorities, assignment, notes, status, and incident linkage."
      />
      <Panel
        title="Support queue"
        hint="Conversation history is never attached automatically."
      >
        {data.supportTickets.map((row) => (
          <Pressable
            key={String(row.id)}
            disabled={busyKey === `ticket:${String(row.id)}`}
            onPress={() => void openTicket(String(row.id))}
            style={styles.clickRecord}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.recordTitle}>{String(row.subject)}</Text>
              <Text style={styles.recordBody} numberOfLines={2}>
                {String(row.message)}
              </Text>
              <Text style={styles.recordMeta}>
                {String(row.category)} · {String(row.priority)} · {String(row.status)} ·{" "}
                {date(row.updated_at)}
              </Text>
            </View>
            <Text style={styles.link}>Open</Text>
          </Pressable>
        ))}
      </Panel>
    </>
  );
}

function UsersPanel({
  result,
  query,
  setQuery,
  search,
  busyKey,
  reason,
  setReason,
  confirmed,
  setConfirmed,
  admin,
  sensitive,
}: {
  result: OperationsUserLookup | null;
  query: string;
  setQuery: (value: string) => void;
  search: () => Promise<void>;
  busyKey: string;
  reason: string;
  setReason: (value: string) => void;
  confirmed: boolean;
  setConfirmed: (value: boolean) => void;
  admin: boolean;
  sensitive: (key: string, run: () => Promise<unknown>) => void;
}) {
  return (
    <>
      <SectionHeader
        icon={<Users color={colors.success} />}
        title="Safe account support"
        body="Exact email or user ID lookup. No chat content, prompts, transcripts, Persona, or memories."
      />
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void search()}
          autoCapitalize="none"
          placeholder="Exact email or user ID"
          placeholderTextColor={colors.dimmed}
          style={[styles.input, { flex: 1 }]}
        />
        <Pressable
          disabled={busyKey === "lookup"}
          onPress={() => void search()}
          style={styles.primary}
        >
          {busyKey === "lookup"
            ? <ActivityIndicator size="small" color="#fff" />
            : <Search size={17} color="#fff" />}
          <Text style={styles.primaryText}>Lookup</Text>
        </Pressable>
      </View>
      {result
        ? (
          <>
            <View style={styles.userHeader}>
              <ShieldCheck color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.healthTitle}>{result.account.email}</Text>
                <Text selectable style={styles.recordMeta}>
                  {result.account.userId}
                </Text>
              </View>
              <StatusPill value={String(result.entitlement?.tier ?? "free")} />
            </View>
            <View style={styles.queueGrid}>
              <StatCard
                label="PERMANENT CREDITS"
                value={Number(result.credits.permanent_balance ?? 0)}
              />
              <StatCard
                label="SUBSCRIPTION CREDITS"
                value={Number(result.credits.subscription_balance ?? 0)}
              />
              <StatCard
                label="LAST SIGN IN"
                value={result.account.lastSignInAt
                  ? date(result.account.lastSignInAt)
                  : "Never"}
              />
              <StatCard
                label="APP"
                value={String(
                  result.clientSessions[0]?.app_version ?? "Unknown",
                )}
              />
            </View>
            <Panel
              title="Recent media"
              hint="Status and failure metadata only."
            >
              {result.recentMedia.map((media) => (
                <View key={String(media.id)} style={styles.providerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recordTitle}>
                      {String(media.media_type)} · {String(media.status)}
                    </Text>
                    <Text style={styles.recordMeta}>
                      {String(media.provider ?? "no provider")} ·{" "}
                      {String(media.failure_code ?? "no failure")} ·{" "}
                      {date(media.created_at)}
                    </Text>
                  </View>
                  {media.status === "failed"
                    ? (
                      <SmallAction
                        label="Requeue"
                        busy={busyKey === `media:${String(media.id)}`}
                        onPress={() =>
                          sensitive(
                            `media:${String(media.id)}`,
                            () =>
                              retryOperationsMedia(String(media.id), reason),
                          )}
                      />
                    )
                    : null}
                </View>
              ))}
            </Panel>
            <Panel
              title="Credit ledger"
              hint="Only exact spend transactions can be restored."
            >
              {result.creditLedger.map((entry) => (
                <View key={String(entry.id)} style={styles.providerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recordTitle}>
                      {String(entry.event_type)} ·{" "}
                      {Number(entry.permanent_delta ?? 0) +
                        Number(entry.subscription_delta ?? 0)} credits
                    </Text>
                    <Text selectable style={styles.recordMeta}>
                      {String(entry.id)} · {date(entry.created_at)}
                    </Text>
                  </View>
                  {admin && entry.event_type === "spend"
                    ? (
                      <SmallAction
                        label="Refund exact"
                        busy={busyKey === `refund:${String(entry.id)}`}
                        onPress={() =>
                          sensitive(`refund:${String(entry.id)}`, () =>
                            refundOperationsCredit(
                              result.account.userId,
                              String(entry.id),
                              reason,
                            ))}
                      />
                    )
                    : null}
                </View>
              ))}
            </Panel>
            <View style={styles.sensitive}>
              <Text style={styles.panelTitle}>
                Sensitive action confirmation
              </Text>
              <Text style={styles.panelHint}>
                A written reason and explicit confirmation are required and
                audited.
              </Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Reason for this action"
                placeholderTextColor={colors.dimmed}
                style={styles.input}
              />
              <Pressable
                onPress={() => setConfirmed(!confirmed)}
                style={[styles.confirm, confirmed && styles.confirmActive]}
              >
                <View style={[styles.check, confirmed && styles.checkActive]}>
                  {confirmed ? <CheckCircle2 size={14} color="#fff" /> : null}
                </View>
                <Text style={styles.recordBody}>
                  I confirm this action targets {result.account.email}
                </Text>
              </Pressable>
              {admin
                ? (
                  <SmallAction
                    label="Invalidate current sessions"
                    busy={busyKey === "sessions"}
                    onPress={() =>
                      sensitive("sessions", () =>
                        invalidateOperationsSessions(
                          result.account.userId,
                          reason,
                        ))}
                  />
                )
                : null}
            </View>
            <Text style={styles.note}>{result.privacyNote}</Text>
          </>
        )
        : null}
    </>
  );
}

function Alerts({
  rules,
  events,
  configuration,
  admin,
  busyKey,
  mutate,
}: {
  rules: OperationsAlertRule[];
  events: Array<Record<string, unknown>>;
  configuration: { webhook: boolean; email: boolean };
  admin: boolean;
  busyKey: string;
  mutate: (key: string, run: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <>
      <SectionHeader
        icon={<Siren color={colors.rose} />}
        title="Alert rules"
        body="Dashboard incidents always work. Email and webhooks remain fail-closed until configured."
      />
      <View style={styles.configRow}>
        <StatusPill
          value={`webhook ${
            configuration.webhook ? "ready" : "not configured"
          }`}
        />
        <StatusPill
          value={`email ${configuration.email ? "ready" : "not configured"}`}
        />
        {admin
          ? (
            <SmallAction
              label="Evaluate now"
              busy={busyKey === "evaluate"}
              onPress={() =>
                void mutate("evaluate", () => evaluateOperationsAlerts())}
            />
          )
          : null}
      </View>
      <View style={styles.alertList}>
        {rules.map((rule) => (
          <AlertRuleCard
            key={rule.id}
            rule={rule}
            admin={admin}
            busy={busyKey === rule.id}
            save={(patch) =>
              mutate(
                rule.id,
                () => updateOperationsAlertRule({ ruleId: rule.id, ...patch }),
              )}
          />
        ))}
      </View>
      <Panel
        title="Recent alert events"
        hint="Delivery metadata contains channel status only."
      >
        {events.slice(0, 50).map((event) => (
          <RecordLine
            key={String(event.id)}
            title={`${String(event.status)} · ${
              Number(event.metric_value).toFixed(2)
            } / ${Number(event.threshold).toFixed(2)}`}
            meta={`${date(event.triggered_at)} · ${
              ((event.channels as string[] | undefined) ?? []).join(", ") ||
                "dashboard"
            }`}
          />
        ))}
      </Panel>
    </>
  );
}

function AlertRuleCard({
  rule,
  admin,
  busy,
  save,
}: {
  rule: OperationsAlertRule;
  admin: boolean;
  busy: boolean;
  save: (
    patch: {
      enabled?: boolean;
      threshold?: number;
      cooldownMinutes?: number;
      channels?: Array<"dashboard" | "webhook" | "email">;
    },
  ) => Promise<unknown>;
}) {
  const [threshold, setThreshold] = useState(String(rule.threshold)),
    [cooldown, setCooldown] = useState(String(rule.cooldown_minutes)),
    [channels, setChannels] = useState(
      rule.channels as Array<"dashboard" | "webhook" | "email">,
    );
  useEffect(() => {
    setThreshold(String(rule.threshold));
    setCooldown(String(rule.cooldown_minutes));
    setChannels(rule.channels as Array<"dashboard" | "webhook" | "email">);
  }, [rule]);
  const toggleChannel = (channel: "dashboard" | "webhook" | "email") =>
    setChannels((current) =>
      current.includes(channel)
        ? current.length > 1
          ? current.filter((item) => item !== channel)
          : current
        : [...current, channel]
    );
  return (
    <View style={styles.alertRule}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={styles.recordTitle}>{rule.name}</Text>
          <Text style={styles.recordMeta}>
            {rule.metric} · {rule.operator} · window {rule.window_minutes}m
          </Text>
        </View>
        <Pressable
          disabled={!admin || busy}
          onPress={() => void save({ enabled: !rule.enabled })}
        >
          <StatusPill value={rule.enabled ? "enabled" : "disabled"} />
        </Pressable>
      </View>
      <View style={styles.ruleInputs}>
        <TextInput
          editable={admin}
          value={threshold}
          onChangeText={setThreshold}
          keyboardType="numeric"
          style={[styles.input, styles.ruleInput]}
        />
        <TextInput
          editable={admin}
          value={cooldown}
          onChangeText={setCooldown}
          keyboardType="numeric"
          style={[styles.input, styles.ruleInput]}
        />
        <Text style={styles.recordMeta}>cooldown minutes</Text>
      </View>
      <View style={styles.actionRow}>
        {(["dashboard", "webhook", "email"] as const).map((channel) => (
          <Pressable
            key={channel}
            disabled={!admin}
            onPress={() => toggleChannel(channel)}
            style={[
              styles.channel,
              channels.includes(channel) && styles.channelActive,
            ]}
          >
            <Text style={styles.channelText}>{channel}</Text>
          </Pressable>
        ))}
        {admin
          ? (
            <SmallAction
              label="Save"
              busy={busy}
              onPress={() =>
                void save({
                  threshold: Number(threshold),
                  cooldownMinutes: Number(cooldown),
                  channels,
                })}
            />
          )
          : null}
      </View>
    </View>
  );
}

function Releases({ data }: { data: OperationsDashboard }) {
  return (
    <>
      <SectionHeader
        icon={<FileClock color={colors.violet} />}
        title="Release health"
        body="Deployment identifiers, migrations, Edge versions, and client versions still active."
      />
      <View style={styles.queueGrid}>
        <StatCard
          label="RUNTIME COMMIT"
          value={data.releaseHealth.runtimeCommit ?? "Not configured"}
        />
        <StatCard
          label="DEPLOYMENT"
          value={data.releaseHealth.runtimeDeployId ?? "Not configured"}
        />
        <StatCard
          label="DATABASE MIGRATION"
          value={data.releaseHealth.latestMigration ?? "Unknown"}
        />
        <StatCard
          label="KNOWN CLIENT VERSIONS"
          value={data.releaseHealth.clientVersions.length}
        />
      </View>
      <Panel
        title="Recorded releases"
        hint="Immutable deployment history recorded by administrators."
      >
        {data.releases.map((release) => (
          <RecordLine
            key={String(release.id)}
            title={`${String(release.environment)} · ${String(release.git_commit)}`}
            body={String(release.deploy_id ?? "No deployment ID")}
            meta={`${date(release.released_at)} · migration ${
              String(release.migration_version ?? "unknown")
            }`}
          />
        ))}
      </Panel>
      <Panel
        title="Clients active in the last 7 days"
        hint="Version heartbeat only; no device fingerprint or IP address."
      >
        {data.releaseHealth.clientVersions.map((version) => (
          <RecordLine
            key={`${version.platform}:${version.appVersion}:${version.buildId}`}
            title={`${version.appVersion} · ${version.platform}`}
            body={`${version.users} active account${
              version.users === 1 ? "" : "s"
            }`}
            meta={`${version.buildId} · last seen ${date(version.lastSeenAt)}`}
          />
        ))}
      </Panel>
    </>
  );
}
function Audit({ rows }: { rows: Array<Record<string, unknown>> }) {
  return (
    <>
      <SectionHeader
        icon={<ShieldCheck color={colors.success} />}
        title="Audit trail"
        body="Append-only records for lookups, support changes, alerts, credits, sessions, and job recovery."
      />
      <Panel
        title="Recent operations actions"
        hint="Audit rows cannot be edited or deleted."
      >
        {rows.map((row) => (
          <RecordLine
            key={String(row.id)}
            title={`${String(row.action)} · ${String(row.actor_role)}`}
            body={row.reason_safe ? String(row.reason_safe) : undefined}
            meta={`${date(row.created_at)} · ${String(row.target_type ?? "system")} · ${
              String(row.target_id ?? "batch")
            }`}
          />
        ))}
      </Panel>
    </>
  );
}

function IncidentLine({ incident }: { incident: OperationsIncident }) {
  return (
    <View style={styles.incidentLine}>
      <View
        style={[
          styles.severity,
          incident.severity === "critical"
            ? styles.severityCritical
            : incident.severity === "warning"
            ? styles.severityWarning
            : styles.severityInfo,
        ]}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.recordTitle}>{incident.title}</Text>
        {incident.summary_safe
          ? <Text style={styles.recordBody}>{incident.summary_safe}</Text>
          : null}
        <Text style={styles.recordMeta}>
          {incident.source} · {incident.status} · {incident.occurrence_count}
          {" "}
          occurrences · {date(incident.last_seen_at)}
        </Text>
      </View>
    </View>
  );
}
function Panel(
  { title, hint, children }: {
    title: string;
    hint: string;
    children: React.ReactNode;
  },
) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelHint}>{hint}</Text>
      {children}
    </View>
  );
}
function SectionHeader(
  { icon, title, body }: { icon: React.ReactNode; title: string; body: string },
) {
  return (
    <View style={styles.sectionHeader}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.subtitle}>{body}</Text>
      </View>
    </View>
  );
}
function RecordLine(
  { title, body, meta }: { title: string; body?: string; meta: string },
) {
  return (
    <View style={styles.record}>
      <Text style={styles.recordTitle}>{title}</Text>
      {body ? <Text style={styles.recordBody}>{body}</Text> : null}
      <Text style={styles.recordMeta}>{meta}</Text>
    </View>
  );
}
function StatusPill({ value }: { value: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{value.toUpperCase()}</Text>
    </View>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue} numberOfLines={2}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function SmallAction(
  { label, onPress, busy, disabled }: {
    label: string;
    onPress: () => void;
    busy?: boolean;
    disabled?: boolean;
  },
) {
  return (
    <Pressable
      disabled={busy || disabled}
      onPress={onPress}
      style={[styles.smallAction, (busy || disabled) && styles.disabled]}
    >
      <Text style={styles.smallActionText}>{busy ? "Working…" : label}</Text>
    </Pressable>
  );
}
function Loading({ label, retry }: { label: string; retry?: () => void }) {
  return (
    <View style={[styles.page, styles.loading]}>
      {retry
        ? <AlertTriangle color={colors.warm} />
        : <ActivityIndicator color={colors.violet} />}
      <Text style={styles.muted}>{label}</Text>
      {retry
        ? (
          <Pressable onPress={retry}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        )
        : null}
    </View>
  );
}
function date(value: unknown) {
  if (!value) return "unknown time";
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString()
    : "unknown time";
}
function duration(seconds: number) {
  if (!seconds) return "—";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#07060C", overflow: "hidden" },
  glow: {
    position: "absolute",
    width: 760,
    height: 760,
    borderRadius: 380,
    top: -420,
    right: -250,
    backgroundColor: "rgba(112,54,160,.13)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,.08)",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(18,14,25,.72)",
    borderRadius: radius.md,
  },
  eyebrow: {
    color: colors.violet,
    fontWeight: "900",
    fontSize: 9,
    letterSpacing: 1.4,
  },
  title: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 29,
    marginTop: 3,
  },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  tabShell: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,.07)",
    backgroundColor: "rgba(10,8,15,.82)",
  },
  tabs: { paddingHorizontal: 24, paddingVertical: 10, gap: 6 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm },
  tabActive: {
    backgroundColor: "rgba(154,104,255,.16)",
    borderWidth: 1,
    borderColor: "rgba(154,104,255,.36)",
  },
  tabText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  tabTextActive: { color: colors.text },
  content: {
    width: "100%",
    maxWidth: 1480,
    alignSelf: "center",
    padding: 24,
    gap: 18,
    paddingBottom: 70,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: "rgba(255,182,95,.35)",
    backgroundColor: "rgba(255,182,95,.08)",
    borderRadius: radius.md,
  },
  errorText: { color: colors.text, flex: 1, fontSize: 12 },
  dismiss: { color: colors.warm, fontSize: 11, fontWeight: "900" },
  health: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 17,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: "rgba(22,16,31,.78)",
  },
  healthDot: { width: 12, height: 12, borderRadius: 6 },
  good: { backgroundColor: colors.success },
  attention: { backgroundColor: colors.warm },
  healthTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  muted: { color: colors.muted, fontSize: 12 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: {
    width: "19.2%",
    minWidth: 170,
    minHeight: 126,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,.035)",
  },
  metricCompact: { width: "47.8%", minWidth: 140 },
  metricIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 7,
  },
  metricLabel: { color: colors.muted, fontSize: 11, marginTop: 4 },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  columnsStack: { flexDirection: "column" },
  panel: {
    flex: 1,
    width: "100%",
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: "rgba(22,16,31,.78)",
    gap: 8,
  },
  panelTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  panelHint: { color: colors.muted, fontSize: 11, marginBottom: 7 },
  record: {
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,.07)",
  },
  clickRecord: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,.07)",
  },
  recordTitle: { color: colors.text, fontWeight: "800", fontSize: 13 },
  recordBody: { color: "#BDB1C1", fontSize: 11, lineHeight: 16, marginTop: 4 },
  recordMeta: { color: colors.dimmed, fontSize: 9, marginTop: 5 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionTitle: {
    fontFamily: typography.display,
    color: colors.text,
    fontSize: 26,
  },
  queueGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  queueCard: {
    flexGrow: 1,
    flexBasis: 330,
    minWidth: 280,
    padding: 17,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(22,16,31,.78)",
    gap: 13,
  },
  queueAttention: { borderColor: "rgba(255,171,105,.4)" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  queueNumbers: { flexDirection: "row", gap: 10 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: "900" },
  statLabel: {
    color: colors.dimmed,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: .8,
    marginTop: 3,
  },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusText: { color: colors.muted, fontSize: 9 },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,.07)",
  },
  providerMetric: {
    color: colors.muted,
    fontSize: 11,
    minWidth: 58,
    textAlign: "right",
  },
  goodValue: { color: colors.success, fontWeight: "900" },
  badValue: { color: colors.rose, fontWeight: "900" },
  incident: {
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,.07)",
    gap: 8,
  },
  incidentLine: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  severity: { width: 4, minHeight: 46, borderRadius: 2 },
  severityCritical: { backgroundColor: colors.rose },
  severityWarning: { backgroundColor: colors.warm },
  severityInfo: { backgroundColor: colors.violet },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
  },
  smallAction: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(154,104,255,.34)",
    backgroundColor: "rgba(154,104,255,.12)",
  },
  smallActionText: { color: colors.text, fontSize: 10, fontWeight: "900" },
  disabled: { opacity: .45 },
  ticketMessage: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
    paddingVertical: 12,
  },
  input: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(7,6,12,.8)",
    color: colors.text,
    paddingHorizontal: 13,
    fontSize: 13,
  },
  noteInput: { minHeight: 100, textAlignVertical: "top", paddingTop: 12 },
  link: { color: colors.violet, fontSize: 11, fontWeight: "900" },
  searchRow: { flexDirection: "row", gap: 10 },
  primary: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.violet,
  },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 11 },
  userHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 17,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: "rgba(22,16,31,.78)",
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 210,
    minWidth: 180,
    minHeight: 100,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,.035)",
    justifyContent: "center",
  },
  sensitive: {
    gap: 10,
    padding: 17,
    borderWidth: 1,
    borderColor: "rgba(255,171,105,.32)",
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,171,105,.05)",
  },
  confirm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  confirmActive: { borderColor: colors.success },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkActive: { backgroundColor: colors.success, borderColor: colors.success },
  configRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  alertList: { gap: 10 },
  alertRule: {
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: "rgba(22,16,31,.78)",
    gap: 11,
  },
  ruleInputs: { flexDirection: "row", alignItems: "center", gap: 8 },
  ruleInput: { width: 105 },
  channel: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  channelActive: {
    borderColor: colors.violet,
    backgroundColor: "rgba(154,104,255,.14)",
  },
  channelText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: "rgba(154,104,255,.12)",
    borderWidth: 1,
    borderColor: "rgba(154,104,255,.27)",
  },
  pillText: {
    color: colors.text,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: .5,
  },
  note: { color: colors.dimmed, fontSize: 10, textAlign: "center" },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 30,
  },
});
