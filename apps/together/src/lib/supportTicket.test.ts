import { describe, expect, it } from "vitest";
import {
  canSubmitSupportRequest,
  canSubmitSupportReply,
  formatSupportTicketReference,
  supportFormErrors,
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
    expect(canSubmitSupportRequest("A".repeat(161), "The page will not load.")).toBe(false);
    expect(canSubmitSupportRequest("Bug", "A".repeat(5001))).toBe(false);
    expect(canSubmitSupportReply("Thanks")).toBe(true);
    expect(canSubmitSupportReply("x")).toBe(false);
    expect(canSubmitSupportReply("A".repeat(5001))).toBe(false);
  });
  it('explains the exact field that blocks a filled-in form', () => {
    expect(supportFormErrors('UI', 'A screenshot of the problem')).toEqual({ subject: 'Add a subject with at least 3 characters.', message: '' });
    expect(supportFormErrors('Bug', 'Broken')).toEqual({ subject: '', message: 'Tell us a little more (at least 10 characters).' });
    expect(supportFormErrors('Bug', 'It will not send')).toEqual({ subject: '', message: '' });
    expect(supportFormErrors('', 'OK', true)).toEqual({ subject: '', message: '' });
  });
});
