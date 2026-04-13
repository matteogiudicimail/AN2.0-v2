/**
 * JWT authentication middleware.
 *
 * OWASP A07 — Auth Failures:
 *   - Validates signature, expiry, issuer, and audience
 *   - Rejects missing, malformed, or expired tokens with 401
 *   - Never logs the full token value
 *
 * V2: Applied to all routes except /api/health
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export function authJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.substring(7); // strip "Bearer "

  // Try to verify with primary secret, then MESA secret as fallback.
  // This allows MESA JWT tokens to also authenticate on CFS configurator routes.
  const secrets: string[] = [];
  const primarySecret = config.jwt.publicKey || config.jwt.secret;
  if (primarySecret) secrets.push(primarySecret);
  if (config.mesaJwtSecret && config.mesaJwtSecret !== primarySecret) {
    secrets.push(config.mesaJwtSecret);
  }

  for (let i = 0; i < secrets.length; i++) {
    try {
      const verifyOptions: jwt.VerifyOptions = {};
      // Only apply issuer/audience constraints for the primary CFS secret
      if (i === 0) {
        if (config.jwt.issuer)   verifyOptions.issuer   = config.jwt.issuer;
        if (config.jwt.audience) verifyOptions.audience = config.jwt.audience;
      }

      const decoded = jwt.verify(token, secrets[i]!, verifyOptions) as jwt.JwtPayload;

      // Attach decoded user to request — never forward the raw token [OWASP A07]
      req.user = {
        sub:   decoded['sub']   as string ?? 'unknown',
        name:  decoded['name']  as string | undefined,
        email: decoded['email'] as string | undefined,
        ...decoded,
      };

      return next();
    } catch (err) {
      const errName = (err as Error).name;
      // If token expired (valid signature), reject immediately — no point trying other secrets
      if (errName === 'TokenExpiredError') {
        console.warn('[authJwt] Token expired');
        res.status(401).json({ error: 'Token expired' });
        return;
      }
      // If this was the last secret and still failed, fall through to rejection
      if (i === secrets.length - 1) {
        console.warn(`[authJwt] Token validation failed: ${errName}`);
        res.status(401).json({ error: 'Invalid token' });
        return;
      }
      // Otherwise try the next secret
    }
  }
}

/**
 * DEV-ONLY helper: creates a signed test token.
 * Must never be exposed via an HTTP endpoint.
 */
export function createDevToken(userId: string): string {
  if (config.isProduction) throw new Error('Dev tokens not allowed in production');
  const signOptions: jwt.SignOptions = { expiresIn: '24h' };
  if (config.jwt.issuer)   signOptions.issuer   = config.jwt.issuer;
  if (config.jwt.audience) signOptions.audience = config.jwt.audience;
  return jwt.sign(
    { sub: userId, name: 'Dev User', email: 'dev@localhost' },
    config.jwt.secret,
    signOptions,
  );
}
