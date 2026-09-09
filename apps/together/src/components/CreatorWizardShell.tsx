import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Sparkles, X } from 'lucide-react-native';
import { colors, radius } from '../theme';

export function CreatorWizardShell({
  title,
  subtitle,
  currentStep,
  totalSteps,
  stepLabel,
  onClose,
  closeDisabled = false,
  maxWidth = 820,
  headerAction,
  children,
}: {
  title: string;
  subtitle: string;
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
  onClose: () => void;
  closeDisabled?: boolean;
  maxWidth?: number;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const mobile = width < 700;

  return <View style={styles.scrim}>
    <View style={[styles.modal, { maxWidth }, mobile && styles.modalMobile]}>
      <View style={styles.header}>
        <View style={styles.headerIcon}><Sparkles size={20} color={colors.rose} /></View>
        <View style={styles.heading}>
          <Text style={styles.kicker}>CREATE A COMPANION</Text>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {headerAction}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close companion creator"
          accessibilityState={{ disabled: closeDisabled }}
          disabled={closeDisabled}
          onPress={onClose}
          style={({ pressed }) => [styles.close, pressed && styles.pressed, closeDisabled && styles.disabled]}
        >
          <X size={21} color={colors.text} />
        </Pressable>
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`Companion creator: ${stepLabel}`}
        accessibilityValue={{ min: 1, max: totalSteps, now: currentStep }}
        style={styles.progress}
      >
        {Array.from({ length: totalSteps }, (_, index) => {
          const step = index + 1;
          return <View
            key={step}
            style={[
              styles.progressPart,
              step < currentStep && styles.progressComplete,
              step === currentStep && styles.progressActive,
            ]}
          />;
        })}
      </View>
      <Text style={styles.stepLabel}>{currentStep} OF {totalSteps} · {stepLabel.toUpperCase()}</Text>

      {children}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  scrim: { minHeight: '100%', alignItems: 'center', justifyContent: 'flex-start', paddingVertical: 20 },
  modal: { width: '100%', gap: 16, padding: 24, borderRadius: 30, borderWidth: 1, borderColor: colors.borderBright, backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: .42, shadowRadius: 30, shadowOffset: { width: 0, height: 18 } },
  modalMobile: { padding: 16, borderRadius: radius.xl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  headerIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,62,234,.1)' },
  heading: { flex: 1, minWidth: 0 },
  kicker: { color: colors.rose, fontWeight: '900', fontSize: 10, letterSpacing: 1.3 },
  title: { color: colors.text, fontFamily: 'Georgia', fontSize: 31, lineHeight: 36, marginTop: 3 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6, maxWidth: 650 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated },
  pressed: { opacity: .76, transform: [{ scale: .98 }] },
  disabled: { opacity: .45 },
  progress: { flexDirection: 'row', gap: 6 },
  progressPart: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border },
  progressComplete: { backgroundColor: colors.violet },
  progressActive: { backgroundColor: colors.rose },
  stepLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
});
