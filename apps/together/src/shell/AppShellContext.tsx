import { createContext, useContext } from 'react';

export type AppShellState = {
  desktop: boolean;
  expanded: boolean;
  sidebarWidth: number;
};

export const mobileAppShellState: AppShellState = { desktop: false, expanded: false, sidebarWidth: 0 };

export const AppShellContext = createContext<AppShellState>(mobileAppShellState);

export function useAppShell() {
  return useContext(AppShellContext);
}
