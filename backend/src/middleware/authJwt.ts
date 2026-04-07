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

  try {
    const secret = config.jwt.publicKey || config.jwt.secret;

    const verifyOptions: jwt.VerifyOptions = {};
    if (config.jwt.issuer)   verifyOptions.issuer   = config.jwt.issuer;
    if (config.jwt.audience) verifyOptions.audience = config.jwt.audience;

    const decoded = jwt.verify(token, secret, verifyOptions) as jwt.JwtPayload;

    // Attach decoded user to request — never forward the raw token [OWASP A07]
    req.user = {
      sub:   decoded['sub']   as string ?? 'unknown',
      name:  decoded['name']  as string | undefined,
      email: decoded['email'] as string | undefined,
      ...decoded,
    };

    next();
  } catch (err) {
    // Log only a generic message — never the token content [OWASP A09]
    const errName = (err as Error).name;
    console.warn(`[authJwt] Token validation failed: ${errName}`);

    if (errName === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired' });
    } else {
      res.status(401).json({ error: 'Invalid token' });
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
