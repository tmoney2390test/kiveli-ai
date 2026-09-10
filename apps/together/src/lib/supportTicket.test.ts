import { describe, expect, it } from "vitest";
import {
  canSubmitSupportRequest,
  formatSupportTicketReference,
} from "./supportTicket";

describe("support ticket presentation", () => {
  it("uses a stable five-digit support reference", () => {
    expect(formatSupportTicketReference(7)).toBe("Support-00007");
    expect(formatSupportTicketReference(10001)).toBe("Support-10001");
  });

  it("requires a useful subject and message", () => {
    expect(canSubmitSupportRequest("Hi", "This is a useful message")).toBe(false);
    expect(canSubmitSupportRequest("Bug", "Too short")).toBe(false);
    expect(canSubmitSupportRequest("Bug", "The page will not load.")).toBe(true);
  });
});
