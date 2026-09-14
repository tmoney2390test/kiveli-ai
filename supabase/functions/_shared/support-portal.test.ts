import { assertEquals, assertRejects } from "jsr:@std/assert";
import { customerSupportDetail, replySupport } from "./support-portal.ts";
function database(ticket: unknown) {
  const queries: Array<
    { table: string; fields: string; filters: Record<string, string> }
  > = [];
  let called = false;
  const db = {
    from(table: string) {
      const q = { table, fields: "", filters: {} as Record<string, string> };
      queries.push(q);
      const chain = {
        select(fields: string) {
          q.fields = fields;
          return chain;
        },
        eq(key: string, value: string) {
          q.filters[key] = value;
          return chain;
        },
        order() {
          return chain;
        },
        maybeSingle() {
          return Promise.resolve({ data: ticket, error: null });
        },
        then(resolve: (v: unknown) => unknown) {
          return Promise.resolve({
            data: [{
              id: "reply",
              sender: "support",
              message: "A public reply",
              created_at: "now",
            }],
            error: null,
          }).then(resolve);
        },
      };
      return chain;
    },
    rpc() {
      called = true;
      return Promise.resolve({ data: "reply", error: null });
    },
  };
  return { db: db as never, queries, rpcCalled: () => called };
}
Deno.test("customer detail scopes ownership and never selects internal notes or metadata", async () => {
  const mock = database({ id: "ticket" }),
    detail = await customerSupportDetail(mock.db, "customer", "ticket");
  assertEquals(mock.queries[0].filters, { id: "ticket", user_id: "customer" });
  assertEquals(mock.queries[0].fields.includes("metadata"), false);
  assertEquals(mock.queries.map((q) => q.table), [
    "together_support_tickets",
    "together_support_replies",
  ]);
  assertEquals(detail.replies.length, 1);
});
Deno.test("unowned tickets reject both reads and replies before accessing messages or RPC", async () => {
  const mock = database(null);
  await assertRejects(() =>
    customerSupportDetail(mock.db, "stranger", "ticket")
  );
  await assertRejects(() =>
    replySupport(mock.db, "stranger", {
      ticketId: "ticket",
      message: "Cannot write this",
      requestId: "key",
    }, false)
  );
  assertEquals(mock.rpcCalled(), false);
  assertEquals(
    mock.queries.every((q) => q.table === "together_support_tickets"),
    true,
  );
});
