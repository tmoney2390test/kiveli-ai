import { AppError } from './types.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key, x-kivelle-timezone',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function json(data: unknown, status = 200, correlationId = crypto.randomUUID()): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId } });
}

export function errorResponse(error: unknown, correlationId: string): Response {
  if (error instanceof AppError) return json({ error: { code: error.code, message: error.message, correlationId, retryable: error.retryable } }, error.status, correlationId);
  console.error(JSON.stringify({ level: 'error', correlationId, message: error instanceof Error ? error.message : 'Unknown error' }));
  return json({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.', correlationId, retryable: false } }, 500, correlationId);
}

export function serve(handler: (request: Request, correlationId: string) => Promise<Response>): void {
  Deno.serve(async (request) => {
    const correlationId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    try { return await handler(request, correlationId); } catch (error) { return errorResponse(error, correlationId); }
  });
}
