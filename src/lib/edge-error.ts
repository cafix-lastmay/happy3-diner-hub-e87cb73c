// Extracts a user-friendly error message from a supabase.functions.invoke() result.
// supabase-js returns FunctionsHttpError with `context` (Response) when the function
// responds with a non-2xx status. We need to parse the JSON body to surface our own
// "error" field instead of the generic "Edge Function returned a non-2xx status code".
import type { FunctionsError } from "@supabase/supabase-js";

export async function extractEdgeError(
  error: unknown,
  data: unknown,
  fallback: string,
): Promise<string> {
  // Server returned 2xx but body contains { error: "..." }
  if (data && typeof data === "object" && "error" in data) {
    const msg = (data as { error?: unknown }).error;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  if (!error) return fallback;

  // Try to read JSON body off the underlying Response (FunctionsHttpError.context)
  const ctx = (error as FunctionsError & { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).clone === "function") {
    try {
      const body = await (ctx as Response).clone().json();
      if (body && typeof body === "object" && typeof body.error === "string" && body.error.trim()) {
        return body.error;
      }
    } catch {
      try {
        const text = await (ctx as Response).clone().text();
        if (text && !/non-2xx/i.test(text)) return text;
      } catch {
        // ignore
      }
    }
  }

  const raw = (error as { message?: string })?.message;
  if (raw && !/non-2xx/i.test(raw)) return raw;
  return fallback;
}
