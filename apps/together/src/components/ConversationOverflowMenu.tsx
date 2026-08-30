import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Brain,
  CalendarDays,
  History,
  Pin,
  RotateCcw,
  Settings,
  Star,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react-native';
import { conversationPlanMenuItems } from '../lib/planActions';
import { colors, radius } from '../theme';
import { FrostedSurface } from './FrostedGlass';

type MenuAction = {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  danger?: boolean;
  selected?: boolean;
  disabled?: boolean;
};

type Props = {
  title: string;
  kind: 'direct' | 'group';
  hasActivePlan: boolean;
  favorite: boolean;
  favoriteBusy: boolean;
  pinned: boolean;
  pinBusy: boolean;
  onClose: () => void;
  onFavorite: () => void;
  onPin: () => void;
  onDetails: () => void;
  onMemory?: () => void;
  memoryLocked?: boolean;
  onHistory?: () => void;
  onCreatePlan: () => void;
  onChangePlan: () => void;
  onEndPlan: () => void;
  onSettings: () => void;
  onFresh: () => void;
  onAdvanced?: () => void;
  onDelete: () => void;
};

/** One predictable overflow hierarchy shared by direct and group chats. */
export function ConversationOverflowMenu({
  title,
  kind,
  hasActivePlan,
  favorite,
  favoriteBusy,
  pinned,
  pinBusy,
  onClose,
  onFavorite,
  onPin,
  onDetails,
  onMemory,
  memoryLocked,
  onHistory,
  onCreatePlan,
  onChangePlan,
  onEndPlan,
  onSettings,
  onFresh,
  onAdvanced,
  onDelete,
}: Props) {
  const planActions = { createPlan: onCreatePlan, changePlan: onChangePlan, endPlan: onEndPlan };
  const identity: MenuAction[] = [
    {
      label: favorite ? 'Remove from favorites' : 'Add to favorites',
      icon: <Star size={16} color={favorite ? '#FFD27A' : colors.muted} fill={favorite ? '#FFD27A' : 'transparent'} />,
      onPress: onFavorite,
      selected: favorite,
      disabled: favoriteBusy,
    },
    {
      label: kind === 'group' ? 'Group details' : 'View profile',
      icon: kind === 'group' ? <UsersRound size={16} color={colors.textSecondary} /> : <UserRound size={16} color={colors.textSecondary} />,
      onPress: onDetails,
    },
    ...(onMemory ? [{
      label: memoryLocked ? 'Memory Center · Kivelle+' : 'Memory Center',
      icon: <Brain size={16} color={memoryLocked ? colors.muted : colors.violet} />,
      onPress: onMemory,
    }] : []),
  ];
  const conversation: MenuAction[] = [
    { label: pinned ? 'Unpin chat' : 'Pin chat', icon: <Pin size={16} color={pinned ? colors.violet : colors.textSecondary} fill={pinned ? colors.violet : 'transparent'} />, onPress: onPin, selected: pinned, disabled: pinBusy },
    { label: 'Chat settings', icon: <Settings size={16} color={colors.textSecondary} />, onPress: onSettings },
    ...(onHistory ? [{ label: 'History & search', icon: <History size={16} color={colors.textSecondary} />, onPress: onHistory }] : []),
    { label: 'Start a fresh chat', icon: <RotateCcw size={16} color={colors.textSecondary} />, onPress: onFresh },
  ];
  const manage: MenuAction[] = [
    ...(onAdvanced ? [{ label: 'Relationship controls', icon: <RotateCcw size={16} color={colors.warm} />, onPress: onAdvanced }] : []),
    { label: 'Delete this conversation', icon: <Trash2 size={16} color={colors.danger} />, onPress: onDelete, danger: true },
  ];

  return <FrostedSurface intensity={90} style={styles.menu}>
    <View style={styles.header}>
      <Text numberOfLines={1} style={styles.title}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close chat menu" onPress={onClose} style={styles.close}>
        <X size={17} color={colors.muted} />
      </Pressable>
    </View>
    <MenuSection label={kind === 'group' ? 'GROUP' : 'COMPANION'} actions={identity} />
    <MenuSection label="PLAN" actions={conversationPlanMenuItems(hasActivePlan).map((item) => ({
      label: item.label,
      icon: <CalendarDays size={16} color={item.danger ? colors.danger : colors.rose} />,
      onPress: planActions[item.key],
      danger: item.danger,
    }))} />
    <MenuSection label="CONVERSATION" actions={conversation} />
    <MenuSection label="MANAGE" actions={manage} />
  </FrostedSurface>;
}

function MenuSection({ label, actions }: { label: string; actions: MenuAction[] }) {
  return <View style={styles.section}>
    <Text style={styles.sectionLabel}>{label}</Text>
    {actions.map((action) => <Pressable
      key={action.label}
      accessibilityRole="button"
      accessibilityState={{ disabled: action.disabled, selected: action.selected }}
      disabled={action.disabled}
      onPress={action.onPress}
      style={({ pressed }) => [styles.row, action.disabled && styles.disabled, pressed && styles.pressed]}
    >
      <View style={styles.icon}>{action.icon}</View>
      <Text style={[styles.rowLabel, action.danger && styles.danger]}>{action.label}</Text>
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    zIndex: 30,
    top: 72,
    right: 12,
    width: 292,
    maxHeight: '82%',
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(20,16,29,.97)',
    borderColor: 'rgba(199,145,255,.24)',
    shadowColor: '#000',
    shadowOpacity: .52,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, color: colors.text, fontFamily: 'Georgia', fontSize: 18 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.04)' },
  section: { paddingTop: 7 },
  sectionLabel: { color: colors.dimmed, fontSize: 8, fontWeight: '900', letterSpacing: 1.25, paddingHorizontal: 9, paddingVertical: 5 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 9, borderRadius: radius.sm },
  icon: { width: 20, alignItems: 'center' },
  rowLabel: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' },
  danger: { color: colors.danger },
  pressed: { backgroundColor: 'rgba(168,69,242,.12)' },
  disabled: { opacity: .48 },
});
