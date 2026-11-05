/** Prefers a short `{ message }` from the API, and falls back when the body is not JSON. */
export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' && body.message.trim()) {
      return body.message.trim().slice(0, 300);
    }
  } catch {
    /* a proxy or a gateway sometimes returns an empty or HTML error page */
  }
  return fallback;
}
