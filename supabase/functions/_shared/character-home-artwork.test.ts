import { beforeEach, describe, expect, it, vi } from "vitest";
import { homeTestDb } from "../../../scripts/fixtures/home-test-db";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), provider: vi.fn() }));
vi.mock(
  "./together-media-base.ts",
  () => ({ configuredImageProvider: mocks.provider }),
);
import {
  approveHomeArtwork,
  generateHomeArtwork,
} from "./character-home-artwork";
let tables: Record<string, any[]>, db: any, upload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  tables = {
    together_home_artwork: [{
      id: "job",
      home_id: "home",
      status: "queued",
      prompt_text: "A small lived-in apartment with a model shuttle.",
      storage_bucket: "kivelli-home-artwork",
    }],
    together_character_homes: [{
      id: "home",
      character_version_id: "version",
      active: true,
      visits_enabled: true,
    }],
    together_locations: [],
  };
  upload = vi.fn(async () => ({ error: null }));
  db = {
    ...homeTestDb(tables),
    storage: {
      from: () => ({
        upload,
        download: async () => ({
          data: new Blob(["thumbnail"], { type: "image/webp" }),
          error: null,
        }),
      }),
    },
  };
  mocks.generate.mockReset().mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "image/jpeg",
    width: 1536,
    height: 1024,
    model: "fixture",
    estimatedCost: .04,
  });
  mocks.provider.mockReset().mockReturnValue({
    id: "fixture",
    generate: mocks.generate,
  });
});
describe("permanent home artwork", () => {
  it("claims concurrent attempts once and generates an empty environment independently of identity", async () => {
    await Promise.all([
      generateHomeArtwork(db, "job"),
      generateHomeArtwork(db, "job"),
    ]);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({
      generationKind: "home_environment",
      referenceImages: [],
      contentLevel: "standard",
    });
    expect(tables.together_home_artwork[0]).toMatchObject({
      status: "ready",
      storage_path: "home/job.jpg",
      thumbnail_path: "home/job-preview.webp",
      cost_usd: .04,
    });
    expect(tables.together_character_homes[0].approved_artwork_id)
      .toBeUndefined();
  });
  it("never buys again when a ready or failed job is opened again", async () => {
    await generateHomeArtwork(db, "job");
    await generateHomeArtwork(db, "job");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it("keeps failures diagnostic and never replaces approved artwork", async () => {
    tables.together_character_homes[0].approved_artwork_id = "old";
    mocks.generate.mockRejectedValue(new Error("PROVIDER_OFFLINE"));
    await generateHomeArtwork(db, "job");
    expect(tables.together_home_artwork[0]).toMatchObject({
      status: "failed",
      error_code: "PROVIDER_OFFLINE",
    });
    expect(tables.together_character_homes[0].approved_artwork_id).toBe("old");
    await generateHomeArtwork(db, "job");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it("keeps the original if thumbnail transformations are unavailable", async () => {
    db.storage.from = () => ({
      upload,
      download: async () => ({ error: { message: "unavailable" } }),
    });
    await generateHomeArtwork(db, "job");
    expect(tables.together_home_artwork[0]).toMatchObject({
      status: "ready",
      thumbnail_path: null,
    });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it("rejects images from another home or unfinished jobs", async () => {
    await expect(approveHomeArtwork(db, "other", "job")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(approveHomeArtwork(db, "home", "job")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
  it("approves a finished image without generating or deleting its history", async () => {
    await generateHomeArtwork(db, "job");
    await approveHomeArtwork(db, "home", "job");
    expect(tables.together_character_homes[0].approved_artwork_id).toBe("job");
    expect(tables.together_home_artwork).toHaveLength(1);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it("fails safely if storage cannot accept the image", async () => {
    upload.mockResolvedValue({ error: { message: "offline" } } as any);
    await generateHomeArtwork(db, "job");
    expect(tables.together_home_artwork[0]).toMatchObject({
      status: "failed",
      error_code: "HOME_ART_UPLOAD_FAILED",
    });
  });
  it("does not generate a disabled home", async () => {
    tables.together_character_homes[0].visits_enabled = false;
    await generateHomeArtwork(db, "job");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(tables.together_home_artwork[0].error_code).toBe("HOME_DISABLED");
  });
  it("can prepare an explicitly authored catalog home without exposing visits", async () => {
    tables.together_character_homes[0].visits_enabled = false;
    tables.together_character_homes[0].source = 'authored';
    await generateHomeArtwork(db, "job");
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(tables.together_character_homes[0].visits_enabled).toBe(false);
    expect(tables.together_character_homes[0].approved_artwork_id).toBeUndefined();
  });
});
