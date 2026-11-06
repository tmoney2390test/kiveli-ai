import type { adminClient } from './context.ts';
import { AppError } from './types.ts';
import { supportTicketAttachments } from './support-attachments.ts';
type Db = ReturnType<typeof adminClient>;
export async function supportReplies(db: Db, ticketId: string) {
  const { data, error } = await db.from('together_support_replies').select(
    'id,sender,message,created_at',
  ).eq('ticket_id', ticketId).order('created_at').order('id');
  if (error) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Support replies could not be loaded.',
      500,
      true,
    );
  }
  return data ?? [];
}
async function ownedSupportTicket(
  db: Db,
  userId: string,
  ticketId: string,
) {
  const { data: ticket, error } = await db.from('together_support_tickets')
    .select(
      'id,ticket_number,category,subject,message,status,created_at,updated_at,last_support_reply_at',
    ).eq('id', ticketId).eq('user_id', userId).maybeSingle();
  if (error) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Your support request could not be loaded.',
      500,
      true,
    );
  }
  if (!ticket) {
    throw new AppError(
      'NOT_FOUND',
      'That support request is unavailable.',
      404,
    );
  }
  return ticket;
}
export async function customerSupportDetail(db: Db, userId: string, ticketId: string) {
  const ticket = await ownedSupportTicket(db, userId, ticketId);
  const [replies, attachments] = await Promise.all([
    supportReplies(db, ticketId),
    supportTicketAttachments(db, ticketId),
  ]);
  return { ticket, replies, attachments };
}
export async function replySupport(
  db: Db,
  userId: string,
  input: { ticketId: string; message: string; requestId: string; attachmentIds?: string[] },
  isSupport: boolean,
) {
  if (!isSupport) await ownedSupportTicket(db, userId, input.ticketId);
  const { data, error } = await db.rpc('kivelli_reply_support_request', {
    p_ticket_id: input.ticketId,
    p_author_id: userId,
    p_is_support: isSupport,
    p_message: input.message,
    p_request_id: input.requestId,
    p_attachment_ids: input.attachmentIds ?? [],
  });
  if (error) {
    if (error.message.includes('SUPPORT_ATTACHMENT')) {
      throw new AppError(
        'VALIDATION_ERROR',
        'A screenshot is no longer available. Remove it and attach it again.',
        400,
      );
    }
    if (/conflict/i.test(error.message)) {
      throw new AppError(
        'CONFLICT',
        'This reply was already sent with different details. Refresh this request.',
        409,
      );
    }
    throw new AppError(
      'INTERNAL_ERROR',
      'Your reply could not be saved. Please retry.',
      500,
      true,
    );
  }
  return { replyId: data };
}
