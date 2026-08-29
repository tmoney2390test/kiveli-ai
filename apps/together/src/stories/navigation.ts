import { useSyncExternalStore } from 'react';

let storyLibraryRequested = false;
const listeners = new Set<() => void>();

function publish() {
  listeners.forEach((listener) => listener());
}

export function requestStoryLibrary() {
  storyLibraryRequested = true;
  publish();
}

export function closeStoryLibrary() {
  storyLibraryRequested = false;
  publish();
}

export function useStoryLibraryRequested() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => storyLibraryRequested,
    () => false,
  );
}
