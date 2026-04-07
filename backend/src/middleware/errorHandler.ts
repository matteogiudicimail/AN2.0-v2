import { Request, Response, NextFunction } from 'express';
import { isDev } from '../config/env';

/**
 * Centralised Express error handler.
 *
 * OWASP A05 — Security Misconfiguration:
 *   Never expose stack traces or internal messages to clients.
 * V4: Only log to server; send generic message to client.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Log full error server-side (never to client) [V4]
  console.error(`[error] ${req.method} ${req.path} —`, err.message);
  if (isDev()) {
    console.error(err.stack);
  }

  // Determine HTTP status code
  const status = (err as { status?: number }).status ?? 500;

  // Generic message to client — no internals, no stack trace [V4, OWASP A05]
  const clientMessage =
    status >= 500 && !isDev()
      ? 'An internal server error occurred. Please try again later.'
      : err.message; // 4xx sempre; 5xx solo in dev espone il messaggio

  res.status(status).json({ error: clientMessage });
}

/**
 * Creates an HTTP error with a status code.
 * Used by route handlers and services for expected errors.
 */
export function createHttpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}
