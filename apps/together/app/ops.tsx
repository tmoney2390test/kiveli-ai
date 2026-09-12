import { IncidentLine, Panel, SectionHeader, RecordLine, StatusPill, Stat, StatCard, SmallAction, Loading, date, duration } from '../src/components/ops/OperationsPrimitives';
import { styles } from '../src/styles/opsStyles';
import { VideoCostsPanel } from '../src/components/VideoCostsPanel';
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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
  Globe2,
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
import { colors } from "../src/theme";
import {
  evaluateOperationsAlerts,
  invalidateOperationsSessions,
  loadOperationsDashboard,
  loadSafetyReport,
  loadSafetyReports,
  loadSupportTicket,
  lookupOperationsUser,
  type OperationsAlertRule,
  type OperationsDashboard,
  type OperationsIncident,
  type OperationsQueue,
  type OperationsUserLookup,
  type OperationsWorld,
  type OperationsWorldStatus,
  type SafetyReport,
  type SafetyReportDetail,
  refundOperationsCredit,
  retryOperationsMedia,
  updateOperationsAlertRule,
  updateOperationsIncident,
  updateOperationsWorldStatus,
  updateSafetyReport,
  updateSupportTicket,
} from "../src/lib/operations";
import { useAuth } from "../src/hooks/useAuth";

type Tab =
  | "video_costs"
  | "overview"
  | "queues"
  | "incidents"
  | "support"
  | "safety"
  | "users"
  | "alerts"
  | "worlds"
  | "releases"
  | "audit";
const tabs: Array<{ key: Tab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "video_costs", label: "Video costs" },
  { key: "queues", label: "Queues" },
  { key: "incidents", label: "Incidents" },
  { key: "support", label: "Support" },
  { key: "safety", label: "Safety" },
  { key: "users", label: "Users" },
  { key: "alerts", label: "Alerts" },
  { key: "worlds", label: "Worlds" },
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
      !["audit", "worlds"].includes(item.key) || data.access.permissions.admin
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
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item.key }}
              aria-selected={tab === item.key}
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
        {tab === "video_costs" ? <VideoCostsPanel admin={data.access.role === "admin"}/> : null}
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
        {tab === "safety"
          ? <SafetyReports actorId={session?.user.id ?? null} />
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
        {tab === "worlds"
          ? <Worlds worlds={data.worlds} busyKey={busyKey} mutate={mutate} />
          : null}
        {tab === "releases" ? <Releases data={data} /> : null}
        {tab === "audit" ? <Audit rows={data.audit} /> : null}
        <Text style={styles.note}>{data.note}</Text>
      </ScrollView>
    </View>
  );
}

function SafetyReports({ actorId }: { actorId: string | null }) {
  const [reports, setReports] = useState<SafetyReport[]>([]),
    [detail, setDetail] = useState<SafetyReportDetail | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [note, setNote] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadSafetyReports();
      setReports(result.reports);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Safety reports could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const open = async (id: string) => {
    setBusy(id);
    try { setDetail(await loadSafetyReport(id)); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "That report could not be opened."); }
    finally { setBusy(""); }
  };
  const update = async (patch: Parameters<typeof updateSafetyReport>[0]) => {
    setBusy(patch.reportId);
    try {
      await updateSafetyReport(patch);
      setDetail(await loadSafetyReport(patch.reportId));
      await reload();
      setNote("");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That report could not be updated.");
    } finally { setBusy(""); }
  };
  if (detail) {
    const report = detail.report;
    return <>
      <SectionHeader icon={<ShieldCheck color={colors.rose} />} title="Safety report review" body={`${report.severity} · ${report.status} · ${date(report.created_at)}`} />
      <Pressable onPress={() => setDetail(null)}><Text style={styles.link}>← Back to safety queue</Text></Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Panel title={report.reason} hint="Only the reported item and the reporter's submitted context are shown.">
        {report.detail ? <Text style={styles.ticketMessage}>{report.detail}</Text> : null}
        {detail.message ? <View style={styles.clickRecord}><Text style={styles.ticketMessage}>{detail.message.content}</Text></View> : <Text style={styles.muted}>No message was attached to this report.</Text>}
        <View style={styles.actionRow}>
          <SmallAction label="Assign to me" busy={busy === report.id} disabled={!actorId} onPress={() => void update({ reportId: report.id, assignedTo: actorId, status: "reviewing" })} />
          <SmallAction label="Reviewing" busy={busy === report.id} onPress={() => void update({ reportId: report.id, status: "reviewing" })} />
          <SmallAction label="Resolve" busy={busy === report.id} onPress={() => void update({ reportId: report.id, status: "resolved", resolutionCode: "review_complete", ...(note.trim().length >= 2 ? { note } : {}) })} />
          <SmallAction label="Dismiss" busy={busy === report.id} onPress={() => void update({ reportId: report.id, status: "dismissed", resolutionCode: "no_action", ...(note.trim().length >= 2 ? { note } : {}) })} />
        </View>
        <TextInput value={note} onChangeText={setNote} multiline placeholder="Private reviewer note…" placeholderTextColor={colors.dimmed} style={[styles.input, styles.noteInput]} />
      </Panel>
      <Panel title="Review history" hint="Access and changes are audited.">
        {detail.events.map((event) => <RecordLine key={String(event.id)} title={String(event.event_type)} body={event.note_safe ? String(event.note_safe) : undefined} meta={date(event.created_at)} />)}
      </Panel>
    </>;
  }
  return <>
    <SectionHeader icon={<ShieldCheck color={colors.rose} />} title="Safety report queue" body="Urgent reports first, with private content opened only for a selected report." />
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
    <Panel title="Reports" hint={`${reports.filter((report) => !["resolved", "dismissed"].includes(report.status)).length} awaiting resolution`}>
      {loading ? <ActivityIndicator color={colors.violet} /> : reports.map((report) => <Pressable key={report.id} disabled={busy === report.id} onPress={() => void open(report.id)} style={styles.clickRecord}>
        <View style={{ flex: 1 }}><Text style={styles.recordTitle}>{report.reason}</Text><Text style={styles.recordMeta}>{report.severity} · {report.status} · {date(report.created_at)}</Text></View><StatusPill value={report.status} />
      </Pressable>)}
      {!loading && !reports.length ? <Text style={styles.muted}>No safety reports are waiting.</Text> : null}
    </Panel>
  </>;
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

const worldStatusOptions: Array<{ value: OperationsWorldStatus; label: string; detail: string }> = [
  { value: "released", label: "Released", detail: "Available to every user." },
  { value: "early_access", label: "Early Access", detail: "Available to Kivelli+ and Max subscribers." },
  { value: "hidden", label: "Hidden", detail: "Removed from discovery; existing conversations keep working." },
];

function Worlds({ worlds, busyKey, mutate }: {
  worlds: OperationsWorld[];
  busyKey: string;
  mutate: (key: string, run: () => Promise<unknown>) => Promise<void>;
}) {
  const [pending, setPending] = useState<{ world: OperationsWorld; status: OperationsWorldStatus } | null>(null);
  const apply = () => {
    if (!pending) return;
    const current = pending;
    setPending(null);
    void mutate(`world:${current.world.id}`, () => updateOperationsWorldStatus(current.world.id, current.status));
  };
  return <>
    <SectionHeader
      icon={<Globe2 color={colors.violet} />}
      title="World catalog"
      body="Review every world and control when it appears to users. Changes are audited."
    />
    <Panel title="World status" hint="Released is open to everyone. Early Access requires a subscription. Hidden is for preproduction only.">
      {worlds.map((world) => {
        const busy = busyKey === `world:${world.id}`;
        return <View key={world.id} style={styles.worldControl}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.recordTitle}>{world.name}</Text>
              <Text style={styles.recordMeta}>{world.slug} · updated {date(world.updatedAt)}</Text>
            </View>
            <StatusPill value={world.status.replace("_", " ")} />
          </View>
          <View style={styles.worldStatusRow} accessibilityRole="radiogroup" accessibilityLabel={`${world.name} status`}>
            {worldStatusOptions.map((option) => <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: world.status === option.value, disabled: busy }}
              disabled={busy || world.status === option.value}
              onPress={() => setPending({ world, status: option.value })}
              style={[styles.worldStatusChoice, world.status === option.value && styles.worldStatusChoiceActive, busy && styles.disabled]}
            >
              <Text style={[styles.worldStatusChoiceText, world.status === option.value && styles.worldStatusChoiceTextActive]}>{option.label}</Text>
            </Pressable>)}
          </View>
          {busy ? <Text style={styles.muted}>Updating world…</Text> : null}
          {pending?.world.id === world.id ? <View style={styles.worldConfirmation}>
            <View style={{ flex: 1 }}>
              <Text style={styles.recordTitle}>Set {pending.world.name} to {worldStatusOptions.find((item) => item.value === pending.status)?.label}?</Text>
              <Text style={styles.recordBody}>{worldStatusOptions.find((item) => item.value === pending.status)?.detail}</Text>
            </View>
            <View style={styles.actionRow}>
              <SmallAction label="Cancel" onPress={() => setPending(null)} />
              <Pressable accessibilityRole="button" onPress={apply} style={styles.primary}><Text style={styles.primaryText}>Apply status</Text></Pressable>
            </View>
          </View> : null}
        </View>;
      })}
      {!worlds.length ? <Text style={styles.muted}>No worlds are configured.</Text> : null}
    </Panel>
  </>;
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
