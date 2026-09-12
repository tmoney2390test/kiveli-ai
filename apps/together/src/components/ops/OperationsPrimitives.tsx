import type React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import type { OperationsIncident } from '../../lib/operations';
import { colors } from '../../theme';
import { styles } from '../../styles/opsStyles';

export function IncidentLine({ incident }: { incident: OperationsIncident }) {
  return (
    <View style={styles.incidentLine}>
      <View
        style={[
          styles.severity,
          incident.severity === "critical"
            ? styles.severityCritical
            : incident.severity === "warning"
            ? styles.severityWarning
            : styles.severityInfo,
        ]}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.recordTitle}>{incident.title}</Text>
        {incident.summary_safe
          ? <Text style={styles.recordBody}>{incident.summary_safe}</Text>
          : null}
        <Text style={styles.recordMeta}>
          {incident.source} · {incident.status} · {incident.occurrence_count}
          {" "}
          occurrences · {date(incident.last_seen_at)}
        </Text>
      </View>
    </View>
  );
}

export function Panel(
  { title, hint, children }: {
    title: string;
    hint: string;
    children: React.ReactNode;
  },
) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelHint}>{hint}</Text>
      {children}
    </View>
  );
}

export function SectionHeader(
  { icon, title, body }: { icon: React.ReactNode; title: string; body: string },
) {
  return (
    <View style={styles.sectionHeader}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.subtitle}>{body}</Text>
      </View>
    </View>
  );
}

export function RecordLine(
  { title, body, meta }: { title: string; body?: string; meta: string },
) {
  return (
    <View style={styles.record}>
      <Text style={styles.recordTitle}>{title}</Text>
      {body ? <Text style={styles.recordBody}>{body}</Text> : null}
      <Text style={styles.recordMeta}>{meta}</Text>
    </View>
  );
}

export function StatusPill({ value }: { value: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{value.toUpperCase()}</Text>
    </View>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue} numberOfLines={2}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function SmallAction(
  { label, onPress, busy, disabled }: {
    label: string;
    onPress: () => void;
    busy?: boolean;
    disabled?: boolean;
  },
) {
  return (
    <Pressable
      disabled={busy || disabled}
      onPress={onPress}
      style={[styles.smallAction, (busy || disabled) && styles.disabled]}
    >
      <Text style={styles.smallActionText}>{busy ? "Working…" : label}</Text>
    </Pressable>
  );
}

export function Loading({ label, retry }: { label: string; retry?: () => void }) {
  return (
    <View style={[styles.page, styles.loading]}>
      {retry
        ? <AlertTriangle color={colors.warm} />
        : <ActivityIndicator color={colors.violet} />}
      <Text style={styles.muted}>{label}</Text>
      {retry
        ? (
          <Pressable onPress={retry}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        )
        : null}
    </View>
  );
}

export function date(value: unknown) {
  if (!value) return "unknown time";
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString()
    : "unknown time";
}

export function duration(seconds: number) {
  if (!seconds) return "—";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
