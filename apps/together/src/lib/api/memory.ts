import type {
  MemoryCenterCategory,
  MemoryCenterItem,
  MemoryCenterResponse,
  MemoryCenterSort,
} from '../../types';
import { invoke } from './transport';
export const mutateMemory = (input: Record<string, unknown>) => invoke('together-memory', input);
export const getMemoryCenter = (characterInstanceId: string, options: {
  privacyMode?: boolean;
  query?: string;
  category?: MemoryCenterCategory;
  sort?: MemoryCenterSort;
  cursor?: string;
  limit?: number;
  includeSummary?: boolean;
} = {}) =>
  invoke<MemoryCenterResponse>('together-memory', {
    action: 'overview',
    characterInstanceId,
    ...options,
  });
export const getMemoryHistory = (memoryId: string) =>
  invoke<{
    revisions: MemoryCenterItem[];
  }>('together-memory', { action: 'history', memoryId });
export const rememberMessage = (messageId: string, characterInstanceId: string) =>
  invoke<MemoryCenterItem>('together-memory', {
    action: 'remember_message',
    messageId,
    characterInstanceId,
  });
