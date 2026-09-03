import { LegalBullets, LegalSection } from './LegalPage';

export default function PrivateAdultLegalDisclosure({context}:{context:'terms'|'guidelines'}){
  if(context==='guidelines')return <LegalSection title="Private adult-dialogue boundaries"><LegalBullets items={[
    'Adults who have completed Kivelle’s age check may choose explicit dialogue boundaries for private text conversations. This eligibility is separate from subscription status.',
    'Every fictional participant must be unambiguously 18 or older. A group with any minor, unknown-age, ambiguous, or youth-coded participant remains non-explicit.',
    'Public and shared explicit content is prohibited. Explicit image and video generation is unavailable in the iOS and Android apps.',
    'Content involving minors, coercion, exploitation, trafficking, compensated sexual arrangements, bestiality, illegal activity, or non-consensual real-person intimate content is prohibited everywhere.',
  ]}/></LegalSection>;
  return <LegalSection title="5. Private adult dialogue">Kivelle uses the birthdate supplied during account setup to make a server-side adult-eligibility decision. Eligible adults may select explicit boundaries for private text conversations with fictional adult characters on the website and in the iOS and Android apps. Subscription purchase does not determine adult eligibility. Explicit media remains separately restricted, including no explicit image or video generation in native apps, and public or shared explicit content is prohibited. Safety review may inspect the reported response and narrowly scoped details a user submits with a report.</LegalSection>;
}
