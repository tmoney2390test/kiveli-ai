import { OperationsFilter } from "./OperationsFilter";
import { useRef, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { MessageSquareWarning } from "lucide-react-native";
import { styles } from "../../styles/opsStyles";
import { colors } from "../../theme";
import {
  type OperationsDashboard,
  type SupportRecoveryContext,
  type SupportReply,
  updateSupportTicket,
} from "../../lib/operations";
import { filterSupportQueue } from "../../lib/supportRecovery";
import { formatSupportTicketReference } from "../../lib/supportTicket";
import {
  date,
  Panel,
  RecordLine,
  SectionHeader,
  SmallAction,
} from "./OperationsPrimitives";
import { SupportReplies } from "./SupportReplies";
import { SupportCaseRecovery } from "./SupportCaseRecovery";
export function SupportWorkspace({
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
    replies?: SupportReply[];
    recovery?: SupportRecoveryContext;
  } | null;
  note: string;
  setNote: (value: string) => void;
  busyKey: string;
  openTicket: (id: string) => Promise<void>;
  closeDetail: () => void;
  mutate: (key: string, run: () => Promise<unknown>) => Promise<void>;
  actorId: string | null;
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("active"),
    [category, setCategory] = useState("all"),
    [mine, setMine] = useState(false),
    [oldest, setOldest] = useState(true);
  const { width } = useWindowDimensions();
  const selectedId = useRef(detail?.ticket.id);
  selectedId.current = detail?.ticket.id;
  const refreshDetail = (id: string) =>
    selectedId.current === id ? openTicket(id) : Promise.resolve();
  const rows = filterSupportQueue(
    data.supportTickets,
    query,
    status,
    category,
    mine,
    actorId,
    oldest,
  );
  const renderDetail = () => {
    if (!detail) return null;
    const ticket = detail.ticket, id = String(ticket.id);
    const update = (
      patch: Partial<{
        status: string;
        priority: string;
        assignedTo: string | null;
        tags: string[];
        note: string;
      }>,
    ) => {
      let saved = false;
      return mutate(
        `ticket:${id}`,
        async () => {
          const result = await updateSupportTicket({ ticketId: id, ...patch });
          saved = true;
          return result;
        },
      ).then(async () => {
        if (saved) await refreshDetail(id);
        return saved;
      });
    };
    return (
      <>
        <SectionHeader
          icon={<MessageSquareWarning color={colors.violet} />}
          title={String(ticket.subject)}
          body={`${String(ticket.category)} · ${String(ticket.priority)} · ${
            String(ticket.status)
          }`}
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
          <Text style={styles.note}>
            Email notification: {String(
              (ticket.metadata as Record<string, unknown> | undefined)
                ?.support_email_status ?? "Not recorded",
            ).replace(/_/g, " ")}. Replies below are delivered through the
            support portal.
          </Text>
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
            onPress={() =>
              void update({ note }).then((saved) => {
                if (saved) setNote("");
              })}
          />
        </Panel>
        <SupportCaseRecovery
          key={id}
          ticketId={id}
          context={detail.recovery}
          onRecovered={() => refreshDetail(id)}
          canReconcileMembership={data.access.permissions.admin &&
            ticket.category === "billing"}
        />
        <SupportReplies
          key={id}
          ticketId={id}
          replies={detail.replies ?? []}
          onSent={() => refreshDetail(id)}
        />
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
  };
  return (
    <View style={[styles.columns, width < 1250 && styles.columnsStack]}>
      {!(detail && width < 1250)
        ? (
          <View
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: width < 1250 ? "auto" : 0,
              minWidth: 0,
              width: "100%",
              gap: 14,
            }}
          >
            <SectionHeader
              icon={<MessageSquareWarning color={colors.violet} />}
              title="Support workflow"
              body="Priorities, assignment, notes, status, and incident linkage."
            />
            <TextInput
              accessibilityLabel="Search support cases"
              value={query}
              onChangeText={setQuery}
              placeholder="Search reference, subject, or account ID"
              placeholderTextColor={colors.dimmed}
              style={styles.input}
            />
            <View style={styles.actionRow}>
              <OperationsFilter
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "active", label: "Active cases" },
                  { value: "all", label: "All statuses" },
                  { value: "open", label: "Awaiting support" },
                  { value: "in_progress", label: "In progress" },
                  { value: "waiting", label: "Awaiting customer" },
                  { value: "resolved", label: "Resolved" },
                  { value: "closed", label: "Closed" },
                ]}
              />
              <OperationsFilter
                label="Category"
                value={category}
                onChange={setCategory}
                options={[
                  "all",
                  "bug",
                  "billing",
                  "account",
                  "safety",
                  "feedback",
                  "other",
                ].map((value) => ({
                  value,
                  label: value === "all"
                    ? "All categories"
                    : value.charAt(0).toUpperCase() + value.slice(1),
                }))}
              />
              <SmallAction
                label={mine ? "✓ Assigned to me" : "Assigned to me"}
                onPress={() => setMine(!mine)}
              />
              <SmallAction
                label={oldest ? "Oldest first" : "Newest first"}
                onPress={() => setOldest(!oldest)}
              />
            </View>
            <Text style={styles.note}>
              {rows.length} matching cases in the latest{" "}
              {data.supportTickets.length} loaded ·{" "}
              {data.metrics.openSupportTickets ?? 0} open overall
            </Text>
            <Panel
              title="Support queue"
              hint="Conversation history is never attached automatically."
            >
              {rows.map((row) => (
                <Pressable
                  key={String(row.id)}
                  disabled={busyKey === `ticket:${String(row.id)}`}
                  onPress={() => void openTicket(String(row.id))}
                  accessibilityRole="button"
                  style={[
                    styles.clickRecord,
                    detail?.ticket.id === row.id &&
                    {
                      backgroundColor: "#26243B",
                      paddingHorizontal: 10,
                      borderRadius: 8,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recordMeta}>
                      {formatSupportTicketReference(Number(row.ticket_number))}
                    </Text>
                    <Text style={styles.recordTitle}>
                      {String(row.subject)}
                    </Text>
                    <Text style={styles.recordMeta}>
                      {String(row.category)} · {String(row.priority)} ·{" "}
                      {String(row.status)} · {date(row.updated_at)}
                    </Text>
                  </View>
                  <Text style={styles.link}>Open</Text>
                </Pressable>
              ))}
              {!rows.length
                ? <Text style={styles.note}>No cases match these filters.</Text>
                : null}
            </Panel>
          </View>
        )
        : null}
      {detail
        ? (
          <View
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: width < 1250 ? "auto" : 0,
              minWidth: 0,
              width: "100%",
              gap: 14,
            }}
          >
            {renderDetail()}
          </View>
        )
        : null}
    </View>
  );
}
