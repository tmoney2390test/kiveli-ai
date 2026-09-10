import { assertEquals } from "jsr:@std/assert@1";
import {
  supportTicketEmailSubject,
  supportTicketReference,
} from "./kivelle-support-email.ts";

Deno.test("support references retain at least five digits", () => {
  assertEquals(supportTicketReference(42), "Support-00042");
  assertEquals(supportTicketReference(10001), "Support-10001");
});

Deno.test("support email subjects start with the ticket and cannot inject headers", () => {
  assertEquals(
    supportTicketEmailSubject(10001, " Billing issue\r\nBcc: person@example.com "),
    "[Support-10001] Billing issue Bcc: person@example.com",
  );
});
