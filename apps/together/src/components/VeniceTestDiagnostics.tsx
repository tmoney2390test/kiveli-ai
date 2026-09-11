import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { estimateAiCost } from '@together/domain/src/ai-usage';
import { useTogether } from '../store/useTogether';
import { colors } from '../theme';

export function VeniceTestDiagnostics({ metadata }: { metadata?: Record<string, unknown> | null }) {
  const { snapshot } = useTogether();
  const [expanded, setExpanded] = useState(false);
  if (!snapshot?.veniceTest?.available || !metadata || !['venice', 'openai', 'xai'].includes(String(metadata.provider))) return null;
  const model = String(metadata.model ?? metadata.provider);
  const input = metadata.usageMissing !== true && typeof metadata.inputTokens === 'number' ? metadata.inputTokens : null;
  const output = metadata.usageMissing !== true && typeof metadata.outputTokens === 'number' ? metadata.outputTokens : null;
  const reported = typeof metadata.providerCostUsd === 'number' ? metadata.providerCostUsd : null;
  const estimated = typeof metadata.estimatedCostUsd === 'number' ? metadata.estimatedCostUsd : input !== null && output !== null ? estimateAiCost(metadata.provider as 'venice' | 'openai' | 'xai', model, { inputTokens: input, outputTokens: output, cachedInputTokens: Number(metadata.cachedInputTokens ?? 0), reasoningTokens: Number(metadata.reasoningTokens ?? 0), totalTokens: input + output }, metadata.appliedServiceTier) : null;
  const cost = reported ?? estimated;
  return <View style={styles.root}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Test details: ${model}`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.button}>
      <Text style={styles.label}>Test · {model} {expanded ? '⌃' : '⌄'}</Text>
    </Pressable>
    {expanded ? <Text selectable style={styles.details}>
      {typeof metadata.firstTokenLatencyMs === 'number' ? `First token ${(metadata.firstTokenLatencyMs / 1000).toFixed(2)}s · ` : ''}
      {typeof metadata.latencyMs === 'number' ? `Total ${(metadata.latencyMs / 1000).toFixed(2)}s\n` : ''}
      {input !== null && output !== null ? `${input.toLocaleString()} input · ${output.toLocaleString()} output tokens\n` : 'Token usage unavailable\n'}
      {cost !== null ? `${reported !== null ? 'Provider cost' : metadata.costSource === 'estimated_upper_bound' ? 'Estimated cost ceiling' : 'Estimated cost'} $${cost.toFixed(5)}` : 'Cost unavailable'}
      {metadata.fallback === true ? '\nFallback response' : ''}
    </Text> : null}
  </View>;
}
const styles = StyleSheet.create({ root: { paddingHorizontal: 5, marginTop: 3 }, button: { minHeight: 32, justifyContent: 'center' }, label: { color: colors.muted, fontSize: 10 }, details: { color: colors.muted, fontSize: 11, lineHeight: 17, paddingBottom: 6 } });
