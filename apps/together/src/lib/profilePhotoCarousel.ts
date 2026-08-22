export function cycleProfilePhotoIndex(currentIndex: number, delta: number, photoCount: number) {
  if (photoCount <= 0) return 0;
  return ((currentIndex + delta) % photoCount + photoCount) % photoCount;
}
