import { supabase, supabasePublishableKey, supabaseUrl } from '../supabase';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
type ClientPerformanceEvent = {
  surface: string;
  operation: string;
  durationMs: number;
  success: boolean;
  statusCode?: number;
  platform: string;
  appVersion: string;
  buildId: string;
  metadata: Record<string, string | number | boolean | null>;
};
export const performanceSurfaces = new Set([
  'together-bootstrap',
  'together-companion',
  'together-group',
  'together-conversation',
  'together-media',
  'together-dialogue',
  'together-group-dialogue',
  'together-plan',
  'together-interaction',
  'together-memory',
  'together-subscription',
  'together-world-pulse',
]);
const performanceQueue: ClientPerformanceEvent[] = [];
let performanceFlushTimer: ReturnType<typeof setTimeout> | null = null,
  performanceFlushRunning = false;
const performanceReportingReadyAt = Date.now() + 20000;
export function queueClientPerformance(
  input: Omit<ClientPerformanceEvent, 'platform' | 'appVersion' | 'buildId'>,
) {
  if (process.env.EXPO_PUBLIC_KIVELLE_PERFORMANCE_REPORTING_ENABLED === 'false') {
    return;
  }
  performanceQueue.push({
    ...input,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    buildId: Constants.expoConfig?.runtimeVersion
      ? String(Constants.expoConfig.runtimeVersion)
      : 'unknown',
  });
  const startupDelay = Math.max(0, performanceReportingReadyAt - Date.now());
  if (performanceQueue.length >= 20 && startupDelay === 0) {
    void flushClientPerformance();
    return;
  }
  if (!performanceFlushTimer) {
    performanceFlushTimer = setTimeout(
      () => void flushClientPerformance(),
      Math.max(15000, startupDelay),
    );
  }
}
async function flushClientPerformance() {
  if (performanceFlushRunning || !performanceQueue.length) {
    return;
  }
  if (performanceFlushTimer) {
    clearTimeout(performanceFlushTimer);
    performanceFlushTimer = null;
  }
  const events = performanceQueue.splice(0, 25);
  performanceFlushRunning = true;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      return;
    }
    await fetch(`${supabaseUrl}/functions/v1/together-ops`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        apikey: supabasePublishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'report_client_performance', events }),
    });
  } catch {
    /* Performance reporting must never affect the product path. */
  } finally {
    performanceFlushRunning = false;
    if (performanceQueue.length && !performanceFlushTimer) {
      performanceFlushTimer = setTimeout(() => void flushClientPerformance(), 15000);
    }
  }
}
