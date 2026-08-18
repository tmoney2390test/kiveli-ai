import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FeaturedGenderFilter } from './featuredCompanions';

const storageKey = 'kivelle.featured-companions.gender.v1';
const listeners = new Set<() => void>();
let currentGender: FeaturedGenderFilter = 'female';
let hydration: Promise<void> | null = null;

export function getCompanionGenderPreference() {
  return currentGender;
}

export function subscribeCompanionGenderPreference(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hydrateCompanionGenderPreference() {
  hydration ??= AsyncStorage.getItem(storageKey).then((saved) => {
    if (saved === 'female' || saved === 'male' || saved === 'any') updateCurrent(saved);
  }).catch(() => undefined);
  return hydration;
}

export function setCompanionGenderPreference(value: FeaturedGenderFilter) {
  updateCurrent(value);
  void AsyncStorage.setItem(storageKey, value).catch(() => undefined);
}

function updateCurrent(value: FeaturedGenderFilter) {
  if (currentGender === value) return;
  currentGender = value;
  listeners.forEach((listener) => listener());
}
