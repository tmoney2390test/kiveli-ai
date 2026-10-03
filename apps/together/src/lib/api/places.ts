import type { Location, PlaceContext } from '../../types';
import { invoke } from './transport';
export const loadPlaceDetail = (locationId: string) =>
  invoke<{
    place: PlaceContext;
  }>('together-place', { locationId });
export const listPersonalPlaces = (worldId?: string) =>
  invoke<{
    places: Location[];
    quota: {
      used: number;
      limit: number;
    };
  }>('together-place', { action: 'list', worldId });
export const createPersonalPlace = (input: {
  locationId: string;
  worldId: string;
  parentLocationId?: string;
  kind: 'home' | 'bar' | 'restaurant' | 'hotel' | 'outdoors' | 'other';
  name: string;
  description: string;
  activities: string[];
  hours: Record<string, unknown>;
  image: {
    path: string;
    width: number;
    height: number;
  };
}) =>
  invoke<{
    place: Location;
  }>('together-place', { action: 'create', ...input });
export const updatePersonalPlace = (input: {
  locationId: string;
  name: string;
  description: string;
  activities: string[];
  hours?: Record<string, unknown>;
}) =>
  invoke<{
    place: Location;
  }>('together-place', { action: 'update', ...input });
export const prepareNewPersonalPlaceImage = (worldId: string) =>
  invoke<{
    locationId: string;
    upload: {
      bucket: string;
      path: string;
      token: string;
    };
  }>('together-place', { action: 'prepare_create_image', worldId });
export const archivePersonalPlace = (locationId: string) =>
  invoke<{
    archived: boolean;
  }>('together-place', { action: 'archive', locationId });
export const preparePersonalPlaceImage = (locationId: string) =>
  invoke<{
    upload: {
      bucket: string;
      path: string;
      token: string;
    };
  }>('together-place', { action: 'prepare_image', locationId });
export const confirmPersonalPlaceImage = (input: {
  locationId: string;
  path: string;
  width: number;
  height: number;
}) =>
  invoke<{
    place: Location;
  }>('together-place', { action: 'confirm_image', ...input });
