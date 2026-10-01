import { Platform, StyleSheet } from 'react-native';
import { DESKTOP_SIDEBAR_EXPANDED_WIDTH } from '../lib/desktopNavigation';
import { colors, radius, spacing, typography } from '../theme';
import { settingsMaterial as glass } from './settingsMaterial';

export const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden', paddingHorizontal: 12, backgroundColor: glass.backdrop },
  // Reserve the rail's full hover width so it can never cover Settings' own
  // section navigation or steal its pointer events while expanded.
  backdropDesktop: { justifyContent: 'center', ...(Platform.OS === 'web' ? ({ position: 'fixed', top: 0, right: 0, bottom: 0, left: DESKTOP_SIDEBAR_EXPANDED_WIDTH, zIndex: 1200, padding: 18 } as never) : {}) },
  modal: { width: '100%', backgroundColor: glass.glass, overflow: 'hidden', borderColor: glass.border },
  modalDesktop: { maxWidth: 1100, borderRadius: 24, borderWidth: 1, shadowColor: '#000', shadowOpacity: .48, shadowRadius: 44, shadowOffset: { width: 0, height: 22 } },
  modalMobile: { maxWidth: 460, borderRadius: 24, borderWidth: 1 },
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: glass.divider },
  brandMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.selected, borderWidth: 1, borderColor: glass.border },
  brandInitial: { color: '#CFB6DD', fontFamily: typography.display, fontSize: 18 },
  headerCopy: { flex: 1, minWidth: 0 }, title: { color: colors.text, fontFamily: typography.display, fontWeight: '600', fontSize: 25 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: .72, transform: [{ scale: .98 }] },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 }, contentColumn: { flex: 1, minWidth: 0 },
  sidebar: { width: 280, paddingTop: 18, paddingBottom: spacing.lg, borderRightWidth: 1, borderRightColor: glass.divider, backgroundColor: 'rgba(11,10,21,.28)' },
  sidebarEyebrow: { color: colors.textSecondary, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.5, marginBottom: 10, paddingHorizontal: 24 },
  sidebarLinks: { gap: 2 }, sidebarLink: { minHeight: 56, paddingHorizontal: 24, borderLeftWidth: 3, borderLeftColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 13 },
  sidebarLinkActive: { backgroundColor: glass.selected, borderLeftColor: glass.accent },
  sidebarLinkText: { color: colors.textSecondary, fontSize: 15, fontWeight: '700' }, sidebarLinkTextActive: { color: '#F1E7F3' },
  logoutButton: { minHeight: 48, marginTop: 'auto', marginHorizontal: 18, paddingHorizontal: 14, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: 'rgba(255,113,129,.055)', borderWidth: 1, borderColor: 'rgba(255,113,129,.2)' },
  logoutButtonMobile: { width: '100%', maxWidth: 780, alignSelf: 'center', marginTop: 2, marginHorizontal: 0 }, logoutButtonDisabled: { opacity: .55 }, logoutButtonText: { color: colors.danger, fontSize: 13, fontWeight: '900' },
  mobileBack: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1 }, mainContent: { flexGrow: 1, padding: spacing.lg, paddingBottom: 54 }, mainContentDesktop: { paddingTop: 24, paddingHorizontal: 28, paddingBottom: 64 },
  panel: { width: '100%', maxWidth: 1060, alignSelf: 'flex-start', gap: 18 },
  searchBox: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, borderRadius: 15, borderWidth: 1, borderColor: glass.border, backgroundColor: glass.inset }, searchInput: { flex: 1, minHeight: 50, color: colors.text, fontSize: 15, outlineStyle: 'none' } as never,
  emptySearch: { minHeight: 210, alignItems: 'center', justifyContent: 'center', padding: 28, borderRadius: radius.lg, borderWidth: 1, borderColor: glass.border, backgroundColor: glass.inset }, emptySearchTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 12 }, emptySearchBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  summaryCard: { minHeight: 110, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: glass.inset, borderWidth: 1, borderColor: glass.border }, summaryIcon: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.selected }, summaryKicker: { color: '#CCB5D7', fontSize: 10.5, fontWeight: '900', letterSpacing: 1.1 }, summaryTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 3 }, verified: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }, verifiedText: { fontSize: 11, fontWeight: '800' },
  groupLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginBottom: -14, paddingLeft: 4 },
  group: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: glass.border, backgroundColor: glass.inset },
  settingRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: glass.divider }, disabledRow: { opacity: .55 }, rowPressed: { backgroundColor: glass.selected }, rowIcon: { width: 26, height: 36, alignItems: 'center', justifyContent: 'center' }, rowCopy: { flex: 1, minWidth: 0 }, rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: '800' }, rowTitleDanger: { color: colors.danger }, rowBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 }, rowValue: { maxWidth: 132, color: '#CCB5D7', fontSize: 11.5, fontWeight: '800', textAlign: 'right' }, rowValueDanger: { color: colors.danger },
  lifeHero: { minHeight: 120, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: glass.inset, borderWidth: 1, borderColor: glass.border }, lifeAvatar: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(18,16,22,.56)', borderWidth: 1, borderColor: glass.border }, lifeInitial: { color: '#C9ADCC', fontFamily: typography.display, fontSize: 30 }, lifeName: { color: colors.text, fontFamily: typography.display, fontSize: 26, marginTop: 2 }, lifeMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 }, activePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: glass.accent }, activePillText: { color: '#fff', fontSize: 9.5, fontWeight: '900' },
  infoCard: { padding: 17, borderRadius: radius.md, backgroundColor: glass.inset, borderWidth: 1, borderColor: glass.border }, infoTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, infoBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  metricRow: { flexDirection: 'row', gap: 10 }, metric: { flex: 1, minHeight: 88, justifyContent: 'center', padding: 14, borderRadius: radius.md, backgroundColor: glass.inset, borderWidth: 1, borderColor: glass.border }, metricValue: { color: colors.text, fontFamily: typography.display, fontSize: 29 }, metricLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', marginTop: 3 }, version: { color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 6 },
});
