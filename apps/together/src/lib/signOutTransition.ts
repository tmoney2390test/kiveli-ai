type SignOutTransitionOptions = {
  signOut: () => Promise<void>;
  clearPrivateState: () => void;
  openSignIn: () => void;
};

/**
 * Starts revoking the local session, then immediately removes private app
 * state and opens the public sign-in screen while revocation finishes.
 */
export function startSignOutTransition({ signOut, clearPrivateState, openSignIn }: SignOutTransitionOptions) {
  const request = signOut();
  clearPrivateState();
  openSignIn();
  return request;
}
