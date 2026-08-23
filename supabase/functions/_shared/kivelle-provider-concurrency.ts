import { AppError } from "./types.ts";
import type { AiUsageScope } from "./kivelle-ai-usage.ts";

export type ProviderSlotLease = { id: string; provider: string };

export async function acquireProviderSlot(
  scope: AiUsageScope | undefined,
  provider: "openai" | "xai",
  operation: string,
): Promise<ProviderSlotLease | null> {
  if (!scope?.db || !scope.userId) return null;
  const max = providerConcurrencyLimit(provider);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await scope.db.rpc(
      "kivelle_acquire_provider_slot",
      {
        p_provider: provider,
        p_operation: operation,
        p_user_id: scope.userId,
        p_max_concurrency: max,
        p_lease_seconds: 45,
      },
    );
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "AI capacity could not be reserved.",
        500,
        true,
      );
    }
    if (data) return { id: String(data), provider };
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
    }
  }
  console.warn(
    JSON.stringify({
      level: "warn",
      operation: "dialogue_provider_backpressure",
      provider,
      maxConcurrency: max,
      correlationId: scope.correlationId ?? null,
    }),
  );
  throw new AppError(
    "RATE_LIMITED",
    "Your companion is handling a lot of conversations right now. Try again in a moment.",
    429,
    true,
  );
}

export async function releaseProviderSlot(
  scope: AiUsageScope | undefined,
  lease: ProviderSlotLease | null,
): Promise<void> {
  if (!scope?.db || !lease) return;
  const { error } = await scope.db.rpc("kivelle_release_provider_slot", {
    p_lease_id: lease.id,
  });
  if (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        operation: "release_dialogue_provider_slot",
        provider: lease.provider,
        errorCode: error.code ?? "rpc_failed",
        correlationId: scope.correlationId ?? null,
      }),
    );
  }
}

export function providerConcurrencyLimit(provider: "openai" | "xai"): number {
  const name = provider === "openai"
    ? "KIVELLE_OPENAI_MAX_CONCURRENCY"
    : "KIVELLE_XAI_MAX_CONCURRENCY";
  const fallback = provider === "openai" ? 64 : 32,
    value = Number(Deno.env.get(name) ?? fallback);
  return Number.isFinite(value)
    ? Math.min(500, Math.max(1, Math.floor(value)))
    : fallback;
}
