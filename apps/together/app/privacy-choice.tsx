import { Redirect } from 'expo-router';

/** Compatibility route for confirmation links and older app builds. */
export default function PrivacyChoiceRedirect() {
  return <Redirect href={'/account' as never} />;
}
