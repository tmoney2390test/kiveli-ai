import {
  groupFloorDebt,
  type GroupSpeakerCandidate,
  type GroupTurnPlan,
} from "../../../packages/together-domain/src/index.ts";
import { normalizeResponsesUsage } from "../../../packages/together-domain/src/ai-usage.ts";
import { type AiUsageScope, recordAiUsage } from "./kivelle-ai-usage.ts";

type Result = { plan: GroupTurnPlan; provider: "openai" | "deterministic" };

/**
 * The model is consulted only when deterministic routing produced a genuinely
 * ambiguous best-candidate result. It chooses a floor action; it never writes
 * dialogue and receives no private character context or memories.
 */
export async function refineAmbiguousGroupPlan(
  input: {
    plan: GroupTurnPlan;
    message: string;
    candidates: readonly GroupSpeakerCandidate[];
    usageScope: AiUsageScope;
  },
): Promise<Result> {
  const first = input.plan.actions[0];
  if (
    !first || first.type !== "message" ||
    !first.reasonCodes.includes("best_candidate") ||
    Deno.env.get("KIVELLE_GROUP_DIRECTOR_ENABLED") === "false"
  ) return { plan: input.plan, provider: "deterministic" };
  const available = input.candidates.filter((candidate) => candidate.available),
    ranked = available.map((candidate) =>
      .34 * Number(candidate.knowledgeRelevance ?? .5) +
      .28 * Number(candidate.relationshipRelevance ?? .5) +
      .14 * Number(candidate.directness ?? .5) +
      .1 * Number(candidate.socialEnergy ?? .5) +
      .08 * Number(candidate.affinityWithUser ?? .5) +
      .06 * Number(candidate.tensionWithOthers ?? 0) - groupFloorDebt(candidate)
    ).sort((left, right) => right - left);
  if (ranked.length < 2 || Number(ranked[0]) - Number(ranked[1]) > .09) {
    return { plan: input.plan, provider: "deterministic" };
  }
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return { plan: input.plan, provider: "deterministic" };
  const started = Date.now(),
    model = Deno.env.get("KIVELLE_DIRECTOR_MODEL")?.trim() || "gpt-5-mini";
  let response: Response | undefined;
  try {
    response = await Promise.race([
      fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: prompt(input.message, input.candidates),
          max_output_tokens: 100,
          text: { format: { type: "json_object" } },
        }),
      }),
      timeout(1800),
    ]);
    if (!response.ok) {
      await recordAiUsage(input.usageScope, {
        provider: "openai",
        model,
        operation: "group_director_openai",
        latencyMs: Date.now() - started,
        success: false,
        httpStatus: response.status,
        errorCode: `HTTP_${response.status}`,
      });
      return { plan: input.plan, provider: "deterministic" };
    }
    const payload = await response.json(),
      usage = normalizeResponsesUsage("openai", payload.usage);
    await recordAiUsage(input.usageScope, {
      provider: "openai",
      model,
      operation: "group_director_openai",
      usage,
      latencyMs: Date.now() - started,
      success: true,
      httpStatus: response.status,
    });
    const raw = payload.output_text ??
        payload.output?.flatMap((item: Record<string, unknown>) =>
          Array.isArray(item.content) ? item.content : []
        ).find((item: Record<string, unknown>) => item.type === "output_text")
          ?.text,
      parsed = parse(String(raw ?? "")),
      available = new Set(
        input.candidates.filter((candidate) => candidate.available).map((
          candidate,
        ) => candidate.characterInstanceId),
      );
    if (parsed.silence === true) {
      return {
        provider: "openai",
        plan: {
          ...input.plan,
          actions: [],
          continuationBudget: 0,
          directorUsed: true,
          reasonCodes: ["ai_director_silence"],
        },
      };
    }
    if (
      !parsed.characterInstanceId || !available.has(parsed.characterInstanceId)
    ) return { plan: input.plan, provider: "deterministic" };
    const selected = {
      ...first,
      id: `${parsed.characterInstanceId}:director:0`,
      characterInstanceId: parsed.characterInstanceId,
      reasonCodes: ["ai_director_ambiguous"],
      priority: 1,
    };
    const remaining = input.plan.actions.slice(1).filter((action) =>
      action.characterInstanceId !== selected.characterInstanceId
    );
    return {
      provider: "openai",
      plan: {
        ...input.plan,
        actions: [selected, ...remaining],
        continuationBudget: Math.min(
          input.plan.continuationBudget,
          remaining.length,
        ),
        directorUsed: true,
        reasonCodes: ["ai_director_ambiguous"],
      },
    };
  } catch {
    if (!response) {
      await recordAiUsage(input.usageScope, {
        provider: "openai",
        model,
        operation: "group_director_openai",
        latencyMs: Date.now() - started,
        success: false,
        errorCode: "NETWORK_OR_TIMEOUT",
      });
    }
    return { plan: input.plan, provider: "deterministic" };
  }
}

function prompt(
  message: string,
  candidates: readonly GroupSpeakerCandidate[],
): string {
  return `You are Kivelle Group Director. Choose who takes the conversational floor; do not write dialogue. Silence is valid. Return JSON only: {"characterInstanceId":"one allowed id"} or {"silence":true}.

USER MESSAGE
${message}

CANDIDATES
${
    JSON.stringify(
      candidates.filter((candidate) => candidate.available).map((
        candidate,
      ) => ({
        id: candidate.characterInstanceId,
        name: candidate.name,
        knowledgeRelevance: candidate.knowledgeRelevance,
        relationshipRelevance: candidate.relationshipRelevance,
        directness: candidate.directness,
        socialEnergy: candidate.socialEnergy,
        affinityWithUser: candidate.affinityWithUser,
        affinityWithOthers: candidate.affinityWithOthers,
        tensionWithOthers: candidate.tensionWithOthers,
        recentSpeakerCount: candidate.recentSpeakerCount,
        consecutiveSpeakerCount: candidate.consecutiveSpeakerCount,
      })),
    )
  }

Choose the person with the most novel, natural reason to respond. Penalize recent domination. Do not force round robin. Return silence if no one would naturally add value.`;
}
function parse(
  raw: string,
): { characterInstanceId?: string; silence?: boolean } {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}
function timeout(ms: number): Promise<Response> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("group_director_timeout")), ms)
  );
}
