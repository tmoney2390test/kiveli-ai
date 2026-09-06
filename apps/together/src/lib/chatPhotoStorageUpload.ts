export type PreparedChatPhotoUpload = {
  bucket: string;
  path: string;
  token?: string | null;
};

type StorageUploadResult = { error: unknown };

export type ChatPhotoStorageBucket = {
  uploadToSignedUrl: (
    path: string,
    token: string,
    body: Blob,
    options: { contentType: string },
  ) => PromiseLike<StorageUploadResult>;
  upload: (
    path: string,
    body: Blob,
    options: { contentType: string; upsert: false },
  ) => PromiseLike<StorageUploadResult>;
};

type StorageErrorShape = {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function storageErrorShape(error: unknown): StorageErrorShape {
  return error && typeof error === 'object' ? error as StorageErrorShape : {};
}

function storageErrorStatus(error: unknown): number | null {
  const shape = storageErrorShape(error);
  const status = Number(shape.statusCode ?? shape.status);
  return Number.isFinite(status) ? status : null;
}

function storageErrorMessage(error: unknown): string {
  const message = storageErrorShape(error).message;
  return typeof message === 'string' ? message.toLowerCase() : '';
}

export function isDuplicatePhotoUploadError(error: unknown): boolean {
  const status = storageErrorStatus(error), message = storageErrorMessage(error);
  return status === 409 || message.includes('already exists') || message.includes('duplicate');
}

export function isTransientPhotoUploadError(error: unknown): boolean {
  const status = storageErrorStatus(error), message = storageErrorMessage(error);
  return status === null || status === 408 || status === 429 || status >= 500 ||
    message.includes('network') || message.includes('fetch') || message.includes('timeout');
}

export async function uploadPreparedChatPhoto(input: {
  storage: ChatPhotoStorageBucket;
  upload: PreparedChatPhotoUpload;
  body: Blob;
  contentType: string;
  retryDelayMs?: number;
}): Promise<void> {
  const attempt = async (): Promise<StorageUploadResult> => {
    try {
      return input.upload.token
        ? await input.storage.uploadToSignedUrl(input.upload.path, input.upload.token, input.body, { contentType: input.contentType })
        : await input.storage.upload(input.upload.path, input.body, { contentType: input.contentType, upsert: false });
    } catch (error) {
      return { error };
    }
  };

  let result = await attempt();
  if (!result.error || isDuplicatePhotoUploadError(result.error)) return;
  if (isTransientPhotoUploadError(result.error)) {
    await new Promise((resolve) => setTimeout(resolve, input.retryDelayMs ?? 180));
    result = await attempt();
    if (!result.error || isDuplicatePhotoUploadError(result.error)) return;
  }
  throw new Error('That photo could not be uploaded. Check your connection and tap Send to retry.');
}
