import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./types.ts";
import { MESSAGE_CHARACTER_LIMIT } from "../../../packages/together-domain/src/message-limits.ts";

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const forbiddenControlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const invisibleFormattingCharacters = /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
const encoder = new TextEncoder();

export type ClaimedChatMessage = {
  message: Record<string, any>;
  created: boolean;
};

export function normalizeChatMessage(value: string, maximumBytes = 24_000): string {
  const normalized = value.replace(/\r\n?/g, "\n").replace(/[\t\v\f]+/g," ").normalize("NFC").trim();
  if (forbiddenControlCharacters.test(normalized)) {
    throw new AppError(
      "VALIDATION_FAILED",
      "That message contains unsupported control characters.",
      422,
    );
  }
  if (invisibleFormattingCharacters.test(normalized)) {
    throw new AppError(
      "VALIDATION_FAILED",
      "That message contains unsupported invisible formatting.",
      422,
    );
  }
  if (encoder.encode(normalized).byteLength > maximumBytes) {
    throw new AppError(
      "VALIDATION_FAILED",
      "That message is too large to send safely.",
      422,
    );
  }
  if (normalized.length > MESSAGE_CHARACTER_LIMIT) {
    throw new AppError(
      "VALIDATION_FAILED",
      `Messages can be up to ${MESSAGE_CHARACTER_LIMIT.toLocaleString("en-US")} characters.`,
      422,
    );
  }
  assertNonPathologicalMessage(normalized);
  return normalized;
}

export function assertNonPathologicalMessage(value:string):void{
  if(value.length<120)return;
  const nonWhitespace=Array.from(value).filter((char)=>!/[\s\p{P}\p{S}]/u.test(char));
  const whitespaceCount=Array.from(value).filter((char)=>/\s/u.test(char)).length;
  if(whitespaceCount/value.length>.82){
    throw new AppError("VALIDATION_FAILED","That message contains too much empty space.",422);
  }
  if(nonWhitespace.length>=120){
    const frequencies=new Map<string,number>();
    for(const char of nonWhitespace)frequencies.set(char,(frequencies.get(char)??0)+1);
    const dominant=Math.max(...frequencies.values())/nonWhitespace.length;
    if(dominant>.88){
      throw new AppError("VALIDATION_FAILED","That message is mostly repeated content.",422);
    }
  }
  const words=value.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
  if(words.length>=40){
    const frequencies=new Map<string,number>();
    for(const word of words)frequencies.set(word,(frequencies.get(word)??0)+1);
    if(Math.max(...frequencies.values())/words.length>.82){
      throw new AppError("VALIDATION_FAILED","That message is mostly repeated content.",422);
    }
  }
  if(/(?:[A-Za-z0-9+/]{700,}={0,2}|[A-Fa-f0-9]{900,})/u.test(value)){
    throw new AppError("VALIDATION_FAILED","That encoded payload is not a supported chat message.",422);
  }
}

export async function canonicalizeReconnectRequestId(
  db:SupabaseClient,
  input:{userId:string;conversationId:string;fingerprint:string;requestId:string},
):Promise<string>{
  const{data,error}=await db.rpc("kivelle_claim_generation_request_anchor",{
    p_user_id:input.userId,
    p_conversation_id:input.conversationId,
    p_request_fingerprint:input.fingerprint,
    p_request_id:input.requestId,
    p_ttl_seconds:20,
  });
  if(error||typeof data!=="string")throw new AppError("INTERNAL_ERROR","That message could not be reconciled safely.",500,true);
  return assertChatRequestId(data);
}

export function assertChatRequestId(value: string): string {
  if (!requestIdPattern.test(value)) {
    throw new AppError(
      "VALIDATION_FAILED",
      "That message request is invalid. Please send it again.",
      422,
    );
  }
  return value.toLowerCase();
}

export async function chatRequestFingerprint(
  input: Record<string, unknown>,
): Promise<string> {
  const canonical = stableSerialize(input);
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function directResponseKey(requestId: string, suffix = "primary"): string {
  return `direct:${assertChatRequestId(requestId)}:${suffix}`;
}

export async function findExistingChatRequest(
  db: SupabaseClient,
  input: {
    userId: string;
    conversationId: string;
    requestId: string;
    fingerprint: string;
    expectedContent: string;
    characterInstanceId: string;
  },
): Promise<Record<string, any> | null> {
  const { data, error } = await db.from("together_messages").select("*")
    .eq("user_id", input.userId)
    .eq("conversation_id", input.conversationId)
    .eq("role", "user")
    .eq("client_request_id", input.requestId)
    .maybeSingle();
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "That message could not be reconciled safely.",
      500,
      true,
    );
  }
  if (!data) return null;
  const storedFingerprint = typeof data.provider_metadata?.requestFingerprint ===
      "string"
    ? data.provider_metadata.requestFingerprint
    : null;
  const legacyMatch = data.content === input.expectedContent &&
    data.character_instance_id === input.characterInstanceId;
  if (
    (storedFingerprint && storedFingerprint !== input.fingerprint) ||
    (!storedFingerprint && !legacyMatch)
  ) {
    throw new AppError(
      "CONFLICT",
      "That retry no longer matches the original message. Send it as a new message instead.",
      409,
    );
  }
  return data as Record<string, any>;
}

export async function claimChatUserMessage(
  db: SupabaseClient,
  input: {
    userId: string;
    continuityId: string;
    conversationId: string;
    characterInstanceId: string;
    content: string;
    requestId: string;
    providerMetadata: Record<string, unknown>;
    attachmentIds?: string[];
    replyToMessageId?: string;
    mentionedCharacterInstanceIds?: string[];
  },
): Promise<ClaimedChatMessage> {
  const { data, error } = await db.rpc("kivelle_claim_chat_user_message", {
    p_user_id: input.userId,
    p_continuity_id: input.continuityId,
    p_conversation_id: input.conversationId,
    p_character_instance_id: input.characterInstanceId,
    p_content: input.content,
    p_client_request_id: input.requestId,
    p_provider_metadata: input.providerMetadata,
    p_attachment_ids: input.attachmentIds ?? [],
    p_reply_to_message_id: input.replyToMessageId ?? null,
    p_mentioned_character_instance_ids: input.mentionedCharacterInstanceIds ?? [],
  });
  const claimed = Array.isArray(data) ? data[0] : data;
  if (error || !claimed?.message_id) {
    const providerCode = String(error?.message ?? "");
    if (providerCode.includes("PAYLOAD_MISMATCH")) {
      throw new AppError(
        "CONFLICT",
        "That retry no longer matches the original message. Send it as a new message instead.",
        409,
      );
    }
    if (
      providerCode.includes("ATTACHMENT") ||
      providerCode.includes("REPLY_TARGET") ||
      providerCode.includes("MENTION") ||
      providerCode.includes("CHARACTER")
    ) {
      throw new AppError(
        "VALIDATION_FAILED",
        "Part of that message is no longer available. Review it and try again.",
        422,
      );
    }
    if(providerCode.includes("INVALID_CHAT_MESSAGE")){
      throw new AppError("VALIDATION_FAILED",`Messages can be up to ${MESSAGE_CHARACTER_LIMIT.toLocaleString("en-US")} characters.`,422);
    }
    throw new AppError(
      "INTERNAL_ERROR",
      "Your message could not be saved safely.",
      500,
      true,
    );
  }
  const { data: message, error: messageError } = await db.from(
    "together_messages",
  ).select("*,together_conversation_attachments(*)")
    .eq("id", String(claimed.message_id))
    .eq("user_id", input.userId)
    .eq("conversation_id", input.conversationId)
    .single();
  if (messageError || !message) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Your saved message could not be loaded.",
      500,
      true,
    );
  }
  return { message, created: claimed.created === true };
}

export async function commitDirectAssistantMessage(
  db: SupabaseClient,
  input: {
    turnId: string;
    leaseToken: string;
    speakerCharacterInstanceId: string;
    content: string;
    providerMetadata: Record<string, unknown>;
    responseKey: string;
  },
): Promise<ClaimedChatMessage> {
  const { data, error } = await db.rpc("kivelle_commit_direct_message", {
    p_turn_id: input.turnId,
    p_lease_token: input.leaseToken,
    p_speaker_character_instance_id: input.speakerCharacterInstanceId,
    p_content: input.content,
    p_provider_metadata: input.providerMetadata,
    p_response_key: input.responseKey,
  });
  const committed = Array.isArray(data) ? data[0] : data;
  if (error || !committed?.message_id) {
    throw new AppError(
      "CONFLICT",
      "A newer message took the conversational floor.",
      409,
      true,
    );
  }
  const { data: message, error: messageError } = await db.from(
    "together_messages",
  ).select("*").eq("id", String(committed.message_id)).single();
  if (messageError || !message) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Your companion replied, but the response could not be loaded.",
      500,
      true,
    );
  }
  return { message, created: committed.created === true };
}

export async function commitDirectSystemMessage(
  db: SupabaseClient,
  input: {
    turnId: string;
    leaseToken: string;
    anchorCharacterInstanceId: string;
    content: string;
    providerMetadata: Record<string, unknown>;
    responseKey: string;
  },
): Promise<ClaimedChatMessage> {
  const { data, error } = await db.rpc("kivelle_commit_direct_system_message", {
    p_turn_id: input.turnId,
    p_lease_token: input.leaseToken,
    p_anchor_character_instance_id: input.anchorCharacterInstanceId,
    p_content: input.content,
    p_provider_metadata: input.providerMetadata,
    p_response_key: input.responseKey,
  });
  const committed = Array.isArray(data) ? data[0] : data;
  if (error || !committed?.message_id) {
    throw new AppError(
      "CONFLICT",
      "A newer message took the conversational floor.",
      409,
      true,
    );
  }
  const { data: message, error: messageError } = await db.from(
    "together_messages",
  ).select("*").eq("id", String(committed.message_id)).single();
  if (messageError || !message) {
    throw new AppError(
      "INTERNAL_ERROR",
      "The scene changed, but its update could not be loaded.",
      500,
      true,
    );
  }
  return { message, created: committed.created === true };
}

export async function commitGroupSystemMessage(
  db: SupabaseClient,
  input: {
    turnId: string;
    version: number;
    anchorCharacterInstanceId: string;
    content: string;
    providerMetadata: Record<string, unknown>;
    responseKey: string;
  },
): Promise<ClaimedChatMessage> {
  const { data, error } = await db.rpc("kivelle_commit_group_system_message", {
    p_turn_id: input.turnId,
    p_version: input.version,
    p_anchor_character_instance_id: input.anchorCharacterInstanceId,
    p_content: input.content,
    p_provider_metadata: input.providerMetadata,
    p_response_key: input.responseKey,
  });
  const committed = Array.isArray(data) ? data[0] : data;
  if (error || !committed?.message_id) {
    throw new AppError(
      "CONFLICT",
      "A newer message took the conversational floor.",
      409,
      true,
    );
  }
  const { data: message, error: messageError } = await db.from(
    "together_messages",
  ).select("*").eq("id", String(committed.message_id)).single();
  if (messageError || !message) {
    throw new AppError(
      "INTERNAL_ERROR",
      "The group scene changed, but its update could not be loaded.",
      500,
      true,
    );
  }
  return { message, created: committed.created === true };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableSerialize(record[key])}`
  ).join(",")}}`;
}
