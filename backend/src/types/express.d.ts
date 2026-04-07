/**
 * Extends Express Request with the decoded JWT payload.
 * Populated by authJwt middleware after token verification.
 */
declare namespace Express {
  interface Request {
    user?: {
      /** Subject claim — typically the user ID */
      sub: string;
      /** Display name or email (if present in token) */
      name?: string;
      email?: string;
      /** Raw decoded token payload for any additional claims */
      [key: string]: unknown;
    };
  }
}
