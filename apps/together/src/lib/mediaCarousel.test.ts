import { describe, expect, it } from "vitest";
import type { GeneratedMedia } from "../types";
import { resolveMediaCarousel } from "./mediaCarousel";

const image = (id: string, conversationId: string, createdAt: string, characterInstanceId = "chloe"): GeneratedMedia => ({
  id,
  character_instance_id: characterInstanceId,
  conversation_id: conversationId,
  media_type: "image",
  content_level: "standard",
  status: "ready",
  signed_url: `https://example.test/${id}.jpg`,
  created_at: createdAt,
});

describe("resolveMediaCarousel", () => {
  const newest = image("newest", "chat-a", "2026-08-26T12:00:00Z");
  const current = image("current", "chat-a", "2026-08-26T11:00:00Z");
  const oldest = image("oldest", "chat-a", "2026-08-26T10:00:00Z");
  const unrelated = image("unrelated", "chat-b", "2026-08-26T13:00:00Z");

  it("keeps automatic chat navigation inside the current conversation", () => {
    const result = resolveMediaCarousel({ media: [oldest, unrelated, current, newest], current });
    expect(result.items.map((item) => item.id)).toEqual(["newest", "current", "oldest"]);
    expect(result.previous?.id).toBe("newest");
    expect(result.next?.id).toBe("oldest");
  });

  it("can browse the Moments photo stream while respecting its companion filter", () => {
    const otherCompanion = image("other", "chat-c", "2026-08-26T14:00:00Z", "maya");
    const result = resolveMediaCarousel({ media: [otherCompanion, current, oldest], current, mode: "moments", characterInstanceId: "chloe" });
    expect(result.items.map((item) => item.id)).toEqual(["current", "oldest"]);
  });

  it("does not include failed or non-image media", () => {
    const failed = { ...newest, id: "failed", status: "failed" as const };
    const video = { ...newest, id: "video", media_type: "video" as const };
    expect(resolveMediaCarousel({ media: [failed, video, current], current }).items.map((item) => item.id)).toEqual(["current"]);
  });

  it("does not expose direct-video opening frames as standalone gallery photos",()=>{
    const poster={...newest,id:"poster",metadata:{hiddenIntermediate:true,galleryPosterOnly:true}};
    expect(resolveMediaCarousel({media:[poster,current],current}).items.map((item)=>item.id)).toEqual(["current"]);
  });
});
