import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronRight, GitBranch, MessageCircle, Plus, Trash2, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatBranchPath } from '../lib/chatBranchPaths';
import { colors, radius } from '../theme';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';

function lastUsedLabel(value: string | null): string {
  if (!value) return 'Saved path';
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'Saved path';
  if (elapsed < 60_000) return 'Used just now';
  if (elapsed < 3_600_000) return `Used ${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `Used ${Math.floor(elapsed / 3_600_000)}h ago`;
  if (elapsed < 7 * 86_400_000) return `Used ${Math.floor(elapsed / 86_400_000)}d ago`;
  return `Used ${new Date(value).toLocaleDateString()}`;
}

export function ChatBranchSwitcher({ visible, name, paths, busy, canCreate, subscriberCanBranch, onClose, onSelect, onCreate, onDelete }: {
  visible: boolean;
  name: string;
  paths: ChatBranchPath[];
  busy: boolean;
  canCreate: boolean;
  subscriberCanBranch: boolean;
  onClose: () => void;
  onSelect: (path: ChatBranchPath) => void;
  onCreate: () => void;
  onDelete: (path: ChatBranchPath) => void;
}) {
  const insets = useSafeAreaInsets();
  const currentIsBranch = paths.some((path) => path.current && !path.original);
  const createLabel = !subscriberCanBranch ? 'Create a path · Kivelle+' : currentIsBranch ? 'Return to main to create a path' : 'Create a new path';
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.root}>
      <FrostedBackdrop intensity={42} />
      <Pressable accessibilityLabel="Close branch manager" style={StyleSheet.absoluteFill} onPress={onClose} />
      <FrostedSurface intensity={90} style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 12) }]}>
        <View accessibilityViewIsModal style={{ flexShrink: 1 }}>
          <View style={styles.handle} />
          <View style={styles.headingRow}>
            <View style={styles.headingCopy}>
              <Text accessibilityRole="header" style={styles.title}>Paths with {name}</Text>
              <Text style={styles.description}>Explore different directions. Your progress is saved in each path.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close branch manager" onPress={onClose} style={styles.close}>
              <X size={19} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
            {paths.map((path) => <View
              key={path.continuityId}
              style={[styles.path, path.current && styles.currentPath]}
            ><Pressable
              accessibilityRole="button"
              accessibilityLabel={`${path.title}${path.current ? ', current path' : ''}`}
              accessibilityState={{ selected: path.current, disabled: busy }}
              disabled={busy}
              onPress={() => onSelect(path)}
              style={({ pressed }) => [styles.pathSelect, pressed && styles.pressed]}
            >
              <View style={[styles.pathIcon, path.current && styles.currentIcon]}>
                {path.original ? <MessageCircle size={23} color={path.current ? '#E2B8FF' : colors.textSecondary} /> : <GitBranch size={23} color={path.current ? '#D29AFF' : colors.rose} />}
              </View>
              <View style={styles.pathCopy}>
                <View style={styles.pathTitleRow}>
                  <Text numberOfLines={1} style={styles.pathTitle}>{path.title}</Text>
                  {path.current ? <View style={styles.badge}><Text style={styles.badgeText}>Current</Text></View> : path.original ? <View style={styles.originalBadge}><Text style={styles.originalBadgeText}>Original</Text></View> : null}
                </View>
                <Text numberOfLines={2} style={styles.preview}>{path.preview}</Text>
                <Text style={styles.date}>{lastUsedLabel(path.lastUsedAt)}</Text>
              </View>
              {busy && path.current ? <ActivityIndicator size="small" color={colors.rose} /> : path.current ? <Check size={18} color={colors.rose} /> : <ChevronRight size={18} color={colors.textSecondary} />}
            </Pressable>
              {!path.original ? <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${path.title}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => onDelete(path)} style={({ pressed }) => [styles.deletePath, pressed && styles.pressed]}><Trash2 size={18} color={colors.danger} /></Pressable> : null}
            </View>)}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={createLabel}
            accessibilityState={{ disabled: busy || (subscriberCanBranch && !currentIsBranch && !canCreate) }}
            disabled={busy || (subscriberCanBranch && !currentIsBranch && !canCreate)}
            onPress={onCreate}
            style={[styles.create, (busy || (subscriberCanBranch && !currentIsBranch && !canCreate)) && styles.disabled]}
          >
            <Plus size={19} color="#fff" />
            <Text style={styles.createText}>{createLabel}</Text>
          </Pressable>
          {subscriberCanBranch && !currentIsBranch && !canCreate ? <Text style={styles.hint}>A new path can start after the latest completed companion reply.</Text> : null}
        </View>
      </FrostedSurface>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '83%', alignSelf: 'center', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingHorizontal: 18, paddingTop: 10, backgroundColor: 'rgba(19,15,29,.9)', borderColor: 'rgba(204,159,248,.28)' },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: 'rgba(229,210,245,.55)', marginBottom: 20 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  headingCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontFamily: 'Georgia', fontSize: 27, lineHeight: 34 },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 7 },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.07)' },
  list: { flexGrow: 0, flexShrink: 1 },
  listContent: { gap: 10, paddingVertical: 7 },
  path: { minHeight: 92, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', backgroundColor: 'rgba(255,255,255,.035)', flexDirection: 'row', alignItems: 'center' },
  pathSelect: { flex: 1, minWidth: 0, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  deletePath: { width: 48, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,.08)' },
  currentPath: { borderColor: 'rgba(206,113,248,.82)', backgroundColor: 'rgba(134,54,169,.18)' },
  pressed: { backgroundColor: 'rgba(168,69,242,.18)' },
  pathIcon: { width: 45, height: 45, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(172,116,233,.09)' },
  currentIcon: { backgroundColor: 'rgba(153,69,216,.22)' },
  pathCopy: { flex: 1, minWidth: 0 },
  pathTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  pathTitle: { color: colors.text, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(178,75,217,.8)' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  originalBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,.09)' },
  originalBadgeText: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  preview: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 5 },
  date: { color: colors.muted, fontSize: 11, marginTop: 5 },
  create: { minHeight: 52, borderRadius: 16, backgroundColor: colors.violet, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 17 },
  createText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: .48 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 9 },
});
