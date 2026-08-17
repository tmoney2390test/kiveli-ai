import { Redirect } from 'expo-router';

// Legacy /profile links used to open the active companion. A user-profile route
// must always resolve to user-owned account settings instead.
export default function UserProfileRedirect() {
  return <Redirect href="/settings" />;
}
