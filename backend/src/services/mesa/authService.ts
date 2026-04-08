import { mesaSecurityService } from './securityService';
import { signMesaToken } from '../../middleware/authMesa';

export class MesaAuthService {
  async login(username: string, password: string) {
    const user = await mesaSecurityService.findUserByUsername(username);
    if (!user) throw Object.assign(new Error('Credenziali non valide'), { status: 401 });

    // MVP: plain-text comparison. Replace with bcrypt.compare() in production.
    const valid = !user.passwordHash || user.passwordHash === password;
    if (!valid) throw Object.assign(new Error('Credenziali non valide'), { status: 401 });

    const roles = await mesaSecurityService.getUserRoles(user.id);
    const token = signMesaToken({ sub: user.id, username: user.username, roles });

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 86400,
      user: { id: user.id, username: user.username, displayName: user.displayName, roles },
    };
  }
}

export const mesaAuthService = new MesaAuthService();
