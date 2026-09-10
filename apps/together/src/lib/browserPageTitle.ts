import type { Snapshot } from '../types';
import { resolveChatRoute } from './chatRoute';
import { chatHrefFromInboxParams } from './messageInbox';

type RouteParams = Record<string, string | string[] | undefined>;

const pageLabels: Record<string, string> = {
  '/': 'Welcome', '/home': 'Home', '/explore': 'Explore', '/singles': 'Discover',
  '/chat-tab': 'Messages', '/messages': 'Messages', '/chat': 'Chat', '/group-chat': 'Group Chat',
  '/new-group': 'New Group', '/archived-chats': 'Archived Chats', '/companions': 'Your Companions',
  '/moments': 'Moments', '/dates': 'Plans', '/market': 'Marketplace',
  '/subscription': 'Membership', '/upgrade': 'Membership',
  '/settings': 'Settings', '/profile': 'Your Profile', '/account': 'Account',
  '/personas': 'Personas & Lives', '/persona-editor': 'Edit Persona',
  '/notifications': 'Notifications', '/privacy': 'Privacy & Safety', '/memories': 'Memories',
  '/conversation-controls': 'Relationship Controls', '/photo-settings': 'Photo Settings',
  '/media-preferences': 'Media Preferences', '/media-content-settings': 'Media Settings',
  '/content-settings': 'Content Settings', '/ops': 'Operations', '/debug': 'Diagnostics',
  '/auth': 'Sign In', '/auth/callback': 'Signing In', '/reset-password': 'Reset Password',
  '/onboarding': 'Get Started', '/quick-start': 'Get Started', '/introduction': 'Introduction',
  '/choose-companion': 'Choose a Companion', '/meet-maya': 'Meet Maya',
  '/age-confirmation': 'Age Confirmation', '/privacy-choice': 'Privacy Choices',
  '/create/companion': 'Create a Companion', '/world/places': 'Places',
  '/call': 'Call', '/plan-live': 'Live Plan', '/support': 'Support', '/help': 'Help',
  '/terms': 'Terms of Use', '/privacy-policy': 'Privacy Policy', '/refund-policy': 'Refund Policy',
  '/community-guidelines': 'Community Guidelines', '/+not-found': 'Page Not Found',
};

const detailLabels: Record<string, string> = {
  character: 'Companion', location: 'Location', media: 'Media', moment: 'Moment',
  date: 'Date', plan: 'Plan', story: 'Story', conversation: 'Archived Chat', conversations: 'Conversations',
};

const settingsLabels: Record<string, string> = {
  profile: 'Your Profile', account: 'Account & Billing', identity: 'Personas & Lives',
  experience: 'Chat & Media Settings', relationships: 'Relationships',
  privacy: 'Privacy & Safety', support: 'Help & Support',
};

export function browserPageTitle(pathname: string, routeParams: RouteParams = {}, snapshot: Snapshot | null = null): string {
  const path = pathname.split(/[?#]/, 1)[0]!.replace(/\/\([^/]+\)/g, '').replace(/\/+$/, '') || '/';
  const params = Object.fromEntries(Object.entries(routeParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));

  if (path === '/group-chat' || (path === '/chat' && params.group === '1')) return 'Group Chat | Kivelli';
  if (path === '/chat' || (path === '/chat-tab' && chatHrefFromInboxParams(params))) {
    // Match the visible conversation's resolution, including conversation IDs,
    // handles, plan handoffs, and the most recent chat. Never use a raw URL value
    // as a character name while the authenticated snapshot is still loading.
    const name = resolveChatRoute(snapshot, params).character?.together_character_templates.name.trim();
    return name ? `Chat | ${name}` : 'Chat | Kivelli';
  }
  if ((path === '/settings' || path === '/profile') && params.section && settingsLabels[params.section]) {
    return `${settingsLabels[params.section]} | Kivelli`;
  }
  const segments = path.split('/').filter(Boolean);
  const label = pageLabels[path]
    ?? (path.startsWith('/create/companion/') ? 'Create a Companion' : undefined)
    ?? (segments.length === 2 ? detailLabels[segments[0]!] : undefined);
  return label ? `${label} | Kivelli` : 'Kivelli';
}
