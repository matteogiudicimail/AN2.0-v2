/**
 * JWT middleware for MESA Data Collection routes.
 * Issues and validates its own JWT (separate from MESAPPA host JWT).
 *
 * Attaches req.mesaUser = { id, username, roles } on success.
 * Returns 401 without exposing internal details [V4].
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface MesaJwtPayload {
  sub: number;
  username: string;
  roles: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      mesaUser?: MesaJwtPayload;
    }
  }
}

function getMesaSecret(): string {
  const secret = process.env['MESA_JWT_SECRET'];
  if (!secret) throw new Error('MESA_JWT_SECRET is not set');
  return secret;
}

export function authMesa(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, getMesaSecret()) as unknown as MesaJwtPayload;
    req.mesaUser = { sub: payload.sub, username: payload.username, roles: payload.roles };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

export function signMesaToken(payload: MesaJwtPayload): string {
  const expiresIn = (process.env['MESA_JWT_EXPIRES_IN'] ?? '24h') as jwt.SignOptions['expiresIn'];
  return jwt.sign(
    { sub: payload.sub, username: payload.username, roles: payload.roles },
    getMesaSecret(),
    { expiresIn },
  );
}
