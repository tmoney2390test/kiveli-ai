import { describe, expect, it } from "vitest";
import { chatErrorPresentation } from "./chatErrorPresentation";

describe("chatErrorPresentation", () => {
  it("does not expose missing server-secret names", () => {
    const result = chatErrorPresentation("Server configuration is missing SUPABASE_SECRET_KEY");
    expect(result.title).toBe("Chat could not connect");
    expect(result.message).not.toContain("SUPABASE");
  });

  it("gives network and capacity failures useful recovery copy", () => {
    expect(chatErrorPresentation(new TypeError("Failed to fetch"))).toMatchObject({ title: "Connection interrupted", retryable: true });
    expect(chatErrorPresentation("Too many requests. Try again later.")).toMatchObject({ title: "Kivelle is busy", retryable: true });
  });

  it("turns expired web sessions into a useful sign-in recovery", () => {
    expect(chatErrorPresentation("WEBSITE_SESSION_PREPARATION_FAILED")).toMatchObject({
      title: "Sign-in needs attention",
      message: "Your draft is saved. Sign in again, then return to this conversation.",
    });
  });

  it("preserves already useful product errors", () => {
    expect(chatErrorPresentation("That photo could not be understood.").message).toBe("That photo could not be understood.");
  });

  it("does not expose internal error codes", () => {
    expect(chatErrorPresentation("INTERNAL_ERROR provider error 503").message).toBe("Nothing was lost. Please try again.");
  });
});
