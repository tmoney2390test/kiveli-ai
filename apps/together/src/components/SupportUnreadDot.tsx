import { View } from 'react-native';
import { useSupportUnread } from '../hooks/useSupportUnread';
import { colors } from '../theme';
export function SupportUnreadDot() {
  const unread = useSupportUnread();
  return unread.data?.count
    ? (
      <View
        accessibilityLabel={`${unread.data.count} unread support ${
          unread.data.count === 1 ? 'reply' : 'replies'
        }`}
        style={{
          position: 'absolute',
          top: 1,
          right: 1,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: colors.violet,
          borderWidth: 1,
          borderColor: colors.background,
        }}
      />
    )
    : null;
}
