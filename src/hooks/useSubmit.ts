// Wraps async actions to prevent double-submit and surface errors as toasts.
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

export function useSubmit<T extends (...args: never[]) => Promise<unknown>>(fn: T) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const submit = useCallback(
    async (...args: Parameters<T>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      try {
        return await fn(...args);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unexpected error";
        toast.error(msg);
        console.error("useSubmit error", err);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [fn],
  ) as (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | void>;

  return { busy, submit };
}
