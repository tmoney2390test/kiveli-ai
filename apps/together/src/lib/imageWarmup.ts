export const KIVELLI_IMAGE_PLACEHOLDER = { blurhash: 'L02rs+~qD%M{~qj[ofay00M{xuWB', width: 16, height: 16 } as const;

export function uniqueHttpsImageUris(values: Array<string | null | undefined>, limit = 8): string[] {
  const result: string[] = [];
  for (const value of values) {
    if (!value?.startsWith('https://') || result.includes(value)) continue;
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}
