import { LegalSection } from './LegalPage';

export default function IosContentDisclosure({context}:{context:'terms'|'guidelines'}) {
  return <LegalSection title={context==='terms'?'5. Conversation and media boundaries':'Conversation and media boundaries'}>Kivelli on iOS supports fictional stories, relationships, and non-graphic mature conversation. Pornographic or sexually explicit text, images, and videos are not available in the iOS app. Content involving minors, coercion, exploitation, or non-consensual intimate content is prohibited. Public and shared content must remain suitable for general display. You can report generated content from its message menu.</LegalSection>;
}
