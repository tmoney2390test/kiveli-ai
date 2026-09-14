import type { adminClient } from "./context.ts";
import { AppError } from "./types.ts";
type Db = ReturnType<typeof adminClient>;
export async function supportReplies(db: Db, ticketId: string) {
  const { data, error } = await db.from("together_support_replies").select(
    "id,sender,message,created_at",
  ).eq("ticket_id", ticketId).order("created_at").order("id");
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Support replies could not be loaded.",
      500,
      true,
    );
  }
  return data ?? [];
}
export async function customerSupportDetail(
  db: Db,
  userId: string,
  ticketId: string,
) {
  const { data: ticket, error } = await db.from("together_support_tickets")
    .select(
      "id,ticket_number,category,subject,message,status,created_at,updated_at",
    ).eq("id", ticketId).eq("user_id", userId).maybeSingle();
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Your support request could not be loaded.",
      500,
      true,
    );
  }
  if (!ticket) {
    throw new AppError(
      "NOT_FOUND",
      "That support request is unavailable.",
      404,
    );
  }
  return { ticket, replies: await supportReplies(db, ticketId) };
}
export async function replySupport(
  db: Db,
  userId: string,
  input: { ticketId: string; message: string; requestId: string },
  isSupport: boolean,
) {
  if (!isSupport) await customerSupportDetail(db, userId, input.ticketId);
  const { data, error } = await db.rpc("kivelle_reply_support_ticket", {
    p_ticket_id: input.ticketId,
    p_author_id: userId,
    p_is_support: isSupport,
    p_message: input.message,
    p_request_id: input.requestId,
  });
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Your reply could not be saved. Please retry.",
      500,
      true,
    );
  }
  return { replyId: data };
}
