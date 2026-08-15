import { Redirect } from 'expo-router';

/** Backward-compatible route for older links and partially-created accounts. */
export default function QuickStart() {
  return <Redirect href="/choose-companion" />;
}
