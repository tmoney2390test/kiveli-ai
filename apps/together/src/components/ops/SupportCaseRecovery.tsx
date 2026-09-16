import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import {
  recoverSupportTicket,
  type SupportRecoveryContext,
} from "../../lib/operations";
import { useSupportRequest } from "../../lib/useSupportRequest";
import {
  date,
  Panel,
  RecordLine,
  SmallAction,
  StatusPill,
} from "./OperationsPrimitives";
import { styles } from "../../styles/opsStyles";
import { colors } from "../../theme";

export function SupportCaseRecovery({
  ticketId,
  context,
  onRecovered,
  canReconcileMembership = false,
}: {
  ticketId: string;
  context?: SupportRecoveryContext;
  onRecovered: () => Promise<void>;
  canReconcileMembership?: boolean;
}) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState("");
  const send = useSupportRequest();
  if (!context) {
    return (
      <Panel
        title="Recovery diagnostics"
        hint="Refresh this case to load recovery data."
      >
        <Text style={styles.note}>
          No repair will run without current server checks.
        </Text>
      </Panel>
    );
  }
  const run = async (
    action:
      | "refresh_delivery"
      | "poll_media"
      | "restore_chat"
      | "reconcile_membership",
    targetId: string,
  ) => {
    if (busy || reason.trim().length < 8) return;
    setBusy(action);
    setNotice("");
    try {
      const result = await send({
        ticketId,
        recoveryAction: action,
        targetId,
        confirmTarget: targetId,
        reason: reason.trim(),
      }, recoverSupportTicket);
      setNotice(result.message);
      setReason("");
      await onRecovered();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Recovery could not be confirmed. Retry the same action.",
      );
    } finally {
      setBusy("");
    }
  };
  const media = context.media, chat = context.conversation;
  return (
    <>
      <Panel
        title="Recovery diagnostics"
        hint="Linked records only. No prompts, media URLs, or conversation transcript are loaded."
      >
        {context.diagnostics
          ? (
            <Text style={styles.recordBody}>
              Client: {context.diagnostics.platform} ·{" "}
              {context.diagnostics.appVersion} ·{" "}
              {context.diagnostics.buildId ?? "Build unavailable"}
            </Text>
          )
          : <Text style={styles.note}>No app diagnostics attached.</Text>}
        {context.purchaseReference
          ? (
            <Text selectable style={styles.recordBody}>
              Customer purchase reference: {context.purchaseReference}
            </Text>
          )
          : null}
        {media
          ? (
            <RecordLine
              title={`${media.media_type} · ${media.status}`}
              body={media.failure_code ?? "No failure recorded"}
              meta={`Requested ${date(media.created_at)} · Updated ${
                date(media.updated_at)
              }`}
            />
          )
          : (
            <Text style={styles.note}>
              No media request linked to this case.
            </Text>
          )}
        {context.providerJobs.map((job) => (
          <RecordLine
            key={job.id}
            title={`${job.provider} · ${job.status}`}
            body={job.failure_code ?? job.model}
            meta={`Submitted ${date(job.submitted_at)} · Provider complete ${
              date(job.provider_completed_at)
            } · Finalized ${date(job.finalized_at)}`}
          />
        ))}
        {chat
          ? (
            <Text style={styles.recordBody}>
              Conversation: {chat.user_archived_at
                ? `Archived · restore until ${date(chat.restore_until)}`
                : "Not user-archived"} · Life {chat.continuity_id ?? "Main"}
            </Text>
          )
          : null}
        <Text style={styles.recordTitle}>Reason for recovery</Text>
        <TextInput
          accessibilityLabel="Reason for recovery"
          value={reason}
          onChangeText={setReason}
          editable={!busy}
          maxLength={500}
          placeholder="Describe what you verified and why this repair is needed"
          placeholderTextColor={colors.dimmed}
          style={[styles.input, styles.noteInput]}
          multiline
        />
        <Text style={styles.note}>
          Each action verifies ownership and eligibility again and records an
          audit. Membership verification can apply benefits confirmed by the
          store. Restoring a chat keeps newer history archived.
        </Text>
        <View style={styles.actionRow}>
          {canReconcileMembership
            ? (
              <SmallAction
                label="Verify store membership"
                busy={busy === "reconcile_membership"}
                disabled={Boolean(busy) || reason.trim().length < 8}
                onPress={() => void run("reconcile_membership", ticketId)}
              />
            )
            : null}
          {media?.status === "ready"
            ? (
              <SmallAction
                label="Refresh existing delivery"
                busy={busy === "refresh_delivery"}
                disabled={Boolean(busy) || reason.trim().length < 8}
                onPress={() => void run("refresh_delivery", media.id)}
              />
            )
            : null}
          {media && ["queued", "generating"].includes(media.status)
            ? (
              <SmallAction
                label="Check existing provider request"
                busy={busy === "poll_media"}
                disabled={Boolean(busy) || reason.trim().length < 8}
                onPress={() => void run("poll_media", media.id)}
              />
            )
            : null}
          {chat?.user_archived_at &&
              Date.parse(chat.restore_until ?? "") > Date.now()
            ? (
              <SmallAction
                label="Restore retained chat"
                busy={busy === "restore_chat"}
                disabled={Boolean(busy) || reason.trim().length < 8}
                onPress={() => void run("restore_chat", chat.id)}
              />
            )
            : null}
        </View>
        {notice
          ? (
            <Text accessibilityLiveRegion="polite" style={styles.note}>
              {notice}
            </Text>
          )
          : null}
        {context.actions.map((action) => (
          <RecordLine
            key={action.id}
            title={action.action.replace(/_/g, " ")}
            body={action.reason}
            meta={date(action.created_at)}
          />
        ))}
      </Panel>
      <Panel
        title="Notification delivery"
        hint="Provider acceptance is not proof that an email reached the inbox. Portal replies remain available."
      >
        {context.emailDelivery.length
          ? context.emailDelivery.map((email) => (
            <View key={email.id} style={styles.clickRecord}>
              <View style={{ flex: 1 }}>
                <Text style={styles.recordTitle}>
                  {email.kind.replace(/_/g, " ")}
                </Text>
                <Text style={styles.recordMeta}>
                  {date(email.created_at)} · {email.attempts}{" "}
                  attempts{email.error_code ? ` · ${email.error_code}` : ""}
                </Text>
              </View>
              <StatusPill value={email.status} />
            </View>
          ))
          : (
            <Text style={styles.note}>
              No notification records found for this case.
            </Text>
          )}
      </Panel>
      <Panel
        title="Recent account credit activity"
        hint="Account-wide context, not a claim that every entry belongs to this ticket. Exact transaction references are shown."
      >
        {context.recentAccountCredits.map((entry) => (
          <RecordLine
            key={entry.id}
            title={`${entry.event_type} · ${
              entry.permanent_delta + entry.subscription_delta
            } credits`}
            body={`${entry.reference_type ?? "No reference"} · ${
              entry.reference_id ?? "—"
            }`}
            meta={date(entry.created_at)}
          />
        ))}
      </Panel>
    </>
  );
}
