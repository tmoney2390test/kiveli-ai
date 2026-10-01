import { useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from './useAuth';
import { useTogether } from '../store/useTogether';
import { confirmAction, showActionAlert } from '../lib/dialogs';
import { startSignOutTransition } from '../lib/signOutTransition';

export function useSignOutAction(onBeforeNavigate?: () => void) {
  const { signOut } = useAuth();
  const clear = useTogether(state => state.clear);
  const [signingOut, setSigningOut] = useState(false);

  const requestSignOut = () => {
    if (signingOut) return;
    confirmAction({
      title: 'Sign out?',
      message: 'Your relationships and memories will still be here when you return.',
      confirmLabel: 'Sign out',
      destructive: true,
      onConfirm: async () => {
        if (signingOut) return;
        setSigningOut(true);
        try {
          await startSignOutTransition({
            signOut,
            clearPrivateState: clear,
            openSignIn: () => {
              onBeforeNavigate?.();
              router.replace('/auth?mode=signin');
            },
          });
        } catch (error) {
          showActionAlert('Could not sign out', error instanceof Error ? error.message : 'Please try again.');
        } finally {
          setSigningOut(false);
        }
      },
    });
  };

  return { signingOut, requestSignOut };
}
