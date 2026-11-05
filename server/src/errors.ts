/** An error that already has the HTTP status the client should see. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const isAbort = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError';
