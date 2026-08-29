import type { CompanionVoiceProfile } from "../../../packages/together-domain/src/multimodal.ts";
import type { RealtimeVoiceProvider, RealtimeVoiceSession } from "./kivelle-multimodal.ts";
import {
  buildKivelleRealtimeInstructions,
  companionCallGreeting,
  realtimeTranscriptionKeyterms,
} from "./kivelle-realtime-voice.ts";
import {
  mintVoiceRelayToken,
  sealVoiceRelayConfiguration,
} from "./voice-relay-token.ts";
import { standardVoiceModelConfiguration } from "./voice-routes.ts";
import { xaiVoiceId } from "./xai-voice.ts";
import { normalizeChatLanguage, openAiTranscriptionLanguage, xaiVoiceLanguage } from "../../../packages/together-domain/src/chat-language.ts";

export class XaiCascadedVoiceProvider implements RealtimeVoiceProvider {
  readonly id = "xai_cascade";

  constructor(
    private readonly relayUrl: string,
    private readonly signingSecret: string,
    private readonly userId: string,
  ) {}

  async createSession(input: {
    callSessionId: string;
    voice: CompanionVoiceProfile;
    context: Record<string, unknown>;
  }): Promise<RealtimeVoiceSession> {
    const models = standardVoiceModelConfiguration();
    const voiceId = xaiVoiceId(input.voice);
    const chatLanguage = normalizeChatLanguage(input.context.chatLanguage);
    const relayConfiguration = {
      transport: "xai_cascade" as const,
      route: "standard" as const,
      url: this.relayUrl,
      model: models.dialogueModel,
      voice: voiceId,
      sampleRate: 24_000,
      greeting: companionCallGreeting(input.context, input.callSessionId),
      session: {
        instructions: buildKivelleRealtimeInstructions(input.context),
        voice: voiceId,
        sttModel: models.sttModel,
        dialogueModel: models.dialogueModel,
        ttsModel: models.ttsModel,
        language: xaiVoiceLanguage(chatLanguage),
        transcriptionLanguage: openAiTranscriptionLanguage(chatLanguage),
        keyterms: realtimeTranscriptionKeyterms(input.context),
        promptCacheKey: `voice:${input.callSessionId}`,
        usageSequenceStart: Math.max(
          0,
          Math.floor(Number(input.context.voiceUsageSequenceStart ?? 0)),
        ),
        turnDetection: {
          threshold: .72,
          prefixPaddingMs: 420,
          silenceDurationMs: 680,
          smartTurn: true,
          smartTurnTimeoutMs: 3_000,
        },
      },
    };
    const relayEnvelope = await sealVoiceRelayConfiguration(
      relayConfiguration,
      this.signingSecret,
    );
    // The browser/device carries only an encrypted envelope. Kivelle's private
    // memory, relationship, and policy context is decrypted by the relay.
    const clientConfiguration = {
      transport: "xai_cascade" as const,
      route: "standard" as const,
      url: this.relayUrl,
      model: models.dialogueModel,
      voice: voiceId,
      sampleRate: 24_000,
      greeting: relayConfiguration.greeting,
      session: {},
      relayEnvelope,
    };
    const credential = await mintVoiceRelayToken({
      userId: this.userId,
      callSessionId: input.callSessionId,
      configuration: clientConfiguration,
      secret: this.signingSecret,
    });
    return {
      providerSessionId: `relay-pending-${credential.jti}`,
      clientSecret: credential.token,
      expiresAt: credential.expiresAt,
      clientConfiguration,
      providerMetadata: {
        route: "standard",
        transport: "kivelle_relay_websocket_pcm16",
        relaySessionId: credential.jti,
        voiceId,
        sampleRate: 24_000,
        model: models.dialogueModel,
        ...models,
      },
    };
  }

  async endSession(): Promise<void> {
    // Closing the client WebSocket tears down the relay's STT, dialogue, and
    // TTS streams. The relay never owns canonical Kivelle state.
  }
}
