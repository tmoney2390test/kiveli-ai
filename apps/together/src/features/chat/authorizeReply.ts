import type { ChatRequestScope } from './requestScope';

/** Lock before awaiting a quote/confirmation, when React's sending state is still false. */
export async function authorizeReply<T>(
  scope: ChatRequestScope,
  authorize: () => Promise<T | null>,
) {
  const request = scope.start('reply');
  if (!request) return null;
  try {
    const authorization = await authorize();
    if (!authorization || !request.isCurrent()) {
      request.release();
      return null;
    }
    return { authorization, request };
  } catch (caught) {
    request.release();
    throw caught;
  }
}
