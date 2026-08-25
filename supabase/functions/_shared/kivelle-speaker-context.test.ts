import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { bindPreparedSpeakerContext } from "./kivelle-speaker-context.ts";

const SPEAKER = "00000000-0000-4000-8000-000000000001";

Deno.test("prepared anchor context binds the selected speaker without rebuilding it", () => {
  const original = {
    character: { name: "Brooke" },
    relationship: { character_instance_id: SPEAKER },
    relationshipReflection: { character_instance_id: SPEAKER },
    memories: [{ characterInstanceId: SPEAKER }],
  } as any;
  const instance = {
    id: SPEAKER,
    together_character_templates: { name: "Brooke" },
  };
  const selected = bindPreparedSpeakerContext({
    instance,
    context: original,
    speakerCharacterInstanceId: SPEAKER,
  });
  assertEquals(selected.context.speakerPrivateContextOwnerId, SPEAKER);
  assertEquals(selected.context.characterVoiceOwnerId, SPEAKER);
  assertEquals(
    selected.context.sceneSpeakerDirective?.characterInstanceId,
    SPEAKER,
  );
  assertEquals(selected.context.character, original.character);
});

Deno.test("prepared anchor context rejects mismatched identity and private-memory leakage", () => {
  assertThrows(() =>
    bindPreparedSpeakerContext({
      instance: { id: SPEAKER },
      context: {} as any,
      speakerCharacterInstanceId: "00000000-0000-4000-8000-000000000002",
    })
  );
  assertThrows(() =>
    bindPreparedSpeakerContext({
      instance: { id: SPEAKER },
      context: {
        relationship: { character_instance_id: SPEAKER },
        memories: [{
          characterInstanceId: "00000000-0000-4000-8000-000000000003",
        }],
      } as any,
      speakerCharacterInstanceId: SPEAKER,
    })
  );
});
