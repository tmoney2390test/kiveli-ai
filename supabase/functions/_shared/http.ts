import { AppError } from './types.ts';
import { normalizeCorrelationId } from '../../../packages/together-domain/src/security.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key, x-kivelle-timezone',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export function json(data: unknown, status = 200, correlationId: string = crypto.randomUUID()): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId } });
}

export function errorResponse(error: unknown, correlationId: string): Response {
  if (error instanceof AppError) return json({ error: { code: error.code, message: error.message, correlationId, retryable: error.retryable } }, error.status, correlationId);
  const structured=structuredError(error);
  console.error(JSON.stringify({ level: 'error', correlationId, ...structured }));
  return json({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.', correlationId, retryable: false } }, 500, correlationId);
}

function structuredError(error:unknown):{message:string;code?:string}{
  if(error instanceof Error)return{message:safeLogValue(error.message)||error.name||'Unknown error'};
  if(error&&typeof error==='object'){
    const value=error as Record<string,unknown>,message=safeLogValue(value.message),code=safeLogValue(value.code);
    return{message:message||'Unknown structured error',...(code?{code}: {})};
  }
  return{message:safeLogValue(error)||'Unknown error'};
}

function safeLogValue(value:unknown):string{
  if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')return'';
  return String(value).replace(/[\r\n\t]+/g,' ').trim().slice(0,400);
}

export function serve(handler: (request: Request, correlationId: string) => Promise<Response>): void {
  Deno.serve(async (request) => {
    const correlationId = normalizeCorrelationId(request.headers.get('x-correlation-id'));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    try { return await handler(request, correlationId); } catch (error) { return errorResponse(error, correlationId); }
  });
}
