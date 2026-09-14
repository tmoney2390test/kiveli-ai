import { useRef } from "react";
import { createClientRequestId } from "./requestId";

// Keep the same key after an uncertain response, so retrying cannot duplicate a ticket/reply.
export function useSupportRequest() {
  const pending = useRef<{ signature: string; requestId: string } | null>(null);
  const active = useRef(false);
  return async <T extends object, R>(
    input: T,
    send: (payload: T & { requestId: string }) => Promise<R>,
  ): Promise<R> => {
    if (active.current) throw new Error("Your request is already sending.");
    active.current = true;
    const signature = JSON.stringify(input);
    if (pending.current?.signature !== signature) {
      pending.current = { signature, requestId: createClientRequestId() };
    }
    try {
      const result = await send({
        ...input,
        requestId: pending.current.requestId,
      });
      pending.current = null;
      return result;
    } finally {
      active.current = false;
    }
  };
}
