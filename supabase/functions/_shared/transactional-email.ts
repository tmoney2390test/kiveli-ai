export type EmailKind = 'support_new' | 'support_received' | 'support_reply' | 'support_followup' | 'membership_welcome';

export function transactionalEmail(kind: EmailKind, payload: Record<string, unknown>) {
  const reference = `Support-${String(Number(payload.ticketNumber) || 0).padStart(5, '0')}`;
  const supportUrl = 'https://kivelli.app/support';
  if (kind === 'support_new') return {
    subject: `${reference}: New Kivelli support request`,
    text: `A new support request is ready for review: ${reference}.\n\nRead the private request and respond in Kivelli Ops:\nhttps://kivelli.app/ops\n\nReply through the portal to notify the customer.`,
  };
  if (kind === 'support_received') return {
    subject: `${reference}: We received your support request`,
    text: `Thanks for contacting Kivelli. Your request is saved as ${reference}.\n\nYou can follow its status and add details in your private support thread:\n${supportUrl}\n\nPlease add replies in the portal so everything stays together. Email replies are not added to your ticket automatically.`,
  };
  if (kind === 'support_reply') return {
    subject: `${reference}: Your support team replied`,
    text: `There is a new reply to ${reference}.\n\nRead it and respond securely in your support thread:\n${supportUrl}\n\nWe keep the details in the portal for your privacy. Email replies are not added to your ticket automatically.`,
  };
  if (kind === 'support_followup') return {
    subject: `${reference}: Customer follow-up`,
    text: `The customer added a message to ${reference}.\n\nReview and reply in Kivelli Ops:\nhttps://kivelli.app/ops\n\nOnly public replies in the support thread notify the customer.`,
  };
  const tier = payload.tier === 'kivelle_max' ? 'Kivelli Max' : 'Kivelli+';
  const store = payload.store === 'APP_STORE' ? 'Apple App Store' : payload.store === 'PLAY_STORE' ? 'Google Play' : 'the store where you subscribed';
  const management = payload.store === 'APP_STORE' ? 'https://apps.apple.com/account/subscriptions' : payload.store === 'PLAY_STORE' ? 'https://play.google.com/store/account/subscriptions' : 'https://kivelli.app/subscription';
  return {
    subject: `Welcome to ${tier}`,
    text: `Your ${tier}${payload.trial === true ? ' trial' : ' membership'} is active.\n\nYour plan: ${payload.interval === 'annual' ? 'Annual' : 'Monthly'}\nPurchased through: ${store}\n\nOpen Membership in Kivelli to see your current benefits, included allowances, credit balance and renewal details:\nhttps://kivelli.app/subscription\n\nYour conversations and personas are ready when you are:\nhttps://kivelli.app\n\nManage renewal or cancel through ${store}:\n${management}\n\nThe store provides your purchase receipt and billing terms. This email is a welcome confirmation, not a receipt.\n\nNeed a hand? Open your private support portal:\n${supportUrl}`,
  };
}

export function retryableEmailStatus(status: number) {
  return status === 429 || status >= 500;
}
