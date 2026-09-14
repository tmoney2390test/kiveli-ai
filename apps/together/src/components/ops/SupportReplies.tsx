import { useState } from "react";
import { Text, TextInput } from "react-native";
import { replyToSupportTicket, type SupportReply } from "../../lib/operations";
import { useSupportRequest } from "../../lib/useSupportRequest";
import { colors } from "../../theme";
import { styles } from "../../styles/opsStyles";
import { date, Panel, RecordLine, SmallAction } from "./OperationsPrimitives";

export function SupportReplies(
  { ticketId, replies, onSent }: {
    ticketId: string;
    replies: SupportReply[];
    onSent: () => Promise<void>;
  },
) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sendRequest = useSupportRequest();
  const send = async () => {
    if (busy || message.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      await sendRequest(
        { ticketId, message: message.trim() },
        (input) => replyToSupportTicket(input, true),
      );
      setMessage("");
      await onSent();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Reply could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      title="Replies"
      hint="Replies here are visible to the customer in their support portal. Private notes stay in the ticket history."
    >
      {replies.map((reply) => (
        <RecordLine
          key={reply.id}
          title={reply.sender === "support" ? "Kivelli Support" : "Customer"}
          body={reply.message}
          meta={date(reply.created_at)}
        />
      ))}
      <TextInput
        accessibilityLabel="Reply to customer"
        value={message}
        editable={!busy}
        onChangeText={setMessage}
        maxLength={5000}
        multiline
        placeholder="Write a reply visible to the customer…"
        placeholderTextColor={colors.dimmed}
        style={[styles.input, styles.noteInput]}
      />
      {error
        ? <Text accessibilityRole="alert" style={styles.note}>{error}</Text>
        : null}
      <SmallAction
        label="Send reply to portal"
        busy={busy}
        disabled={message.trim().length < 2}
        onPress={() => void send()}
      />
    </Panel>
  );
}
