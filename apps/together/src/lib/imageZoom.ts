export const MIN_IMAGE_ZOOM = 1;
export const MAX_IMAGE_ZOOM = 5;

export function clampImageZoom(value: number) {
  return Math.min(MAX_IMAGE_ZOOM, Math.max(MIN_IMAGE_ZOOM, value));
}
