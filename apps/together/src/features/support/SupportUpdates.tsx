import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSupportUnread } from '../../hooks/useSupportUnread';
import { formatSupportTicketReference } from '../../lib/supportTicket';
import { supportStyles as s } from './styles';
export function SupportUpdates() {
  const unread = useSupportUnread();
  if (!unread.data?.count) return null;
  return (
    <View style={[s.card, s.staff]}>
      <Text style={s.subtitle}>Support replies</Text>
      {unread.data.tickets.map((ticket) => (
        <Pressable
          key={ticket.id}
          accessibilityRole='button'
          style={s.action}
          onPress={() => router.push(`/support?ticket=${ticket.id}`)}
        >
          <Text style={s.label}>{ticket.subject}</Text>
          <Text style={s.meta}>
            {formatSupportTicketReference(ticket.ticket_number)} · New reply
          </Text>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole='button'
        style={s.action}
        onPress={() => router.push('/support')}
      >
        <Text style={s.link}>Open support inbox · {unread.data.count} unread</Text>
      </Pressable>
    </View>
  );
}
