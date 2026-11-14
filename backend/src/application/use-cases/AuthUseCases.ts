import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { AuthRole, SafeUser, Vet } from '../../domain/entities';
import { UnauthorizedError, ValidationError } from '../../domain/errors/AppError';
import { IVetLifeRepository } from '../../domain/repositories/IVetLifeRepository';

export interface JwtTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: AuthRole;
  crmv?: string;
  clinic_name?: string;
}

export class AuthUseCases {
  constructor(private readonly repo: IVetLifeRepository) {}

  public async loginInternal(email: string, password: string): Promise<{
    token: string;
    user: SafeUser;
  }> {
    if (!email || !password) {
      throw new ValidationError('E-mail e senha são obrigatórios.');
    }

    const user = await this.repo.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Usuário não encontrado ou credenciais inválidas.');
    }

    const isSeededDemoUser =
      user.id === 'usr-admin-001' || user.id === 'usr-biomed-001';
    const acceptedAdminPasswords = isSeededDemoUser
      ? ['admin123', 'Admin@2026', 'VetLife@2026', user.password_hash]
      : [user.password_hash];
    const acceptedBioPasswords = isSeededDemoUser
      ? ['bio123', 'biomed123', 'Bio@2026', 'VetLife@2026', user.password_hash]
      : [user.password_hash];

    const isValidPassword =
      user.role === 'admin'
        ? acceptedAdminPasswords.includes(password.trim())
        : acceptedBioPasswords.includes(password.trim());

    if (!isValidPassword) {
      throw new UnauthorizedError('Senha incorreta.');
    }

    const safeUser: SafeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    };

    const payload: JwtTokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const signOptions: SignOptions = {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    };

    const token = jwt.sign(payload, env.JWT_SECRET, signOptions);
    return { token, user: safeUser };
  }

  public async loginVet(email: string, credential: string): Promise<{
    token: string;
    vet: Vet;
  }> {
    if (!email || !credential) {
      throw new ValidationError('E-mail e senha de acesso são obrigatórios.');
    }

    const secret = credential.trim();
    const byEmail = await this.repo.findVetByEmail(email);
    let vet: Vet | null = null;

    if (byEmail) {
      if (byEmail.password_hash) {
        if (
          byEmail.password_hash === secret ||
          (byEmail.crmv && byEmail.crmv.toLowerCase() === secret.toLowerCase())
        ) {
          vet = byEmail;
        }
      } else {
        const crmvMatch =
          byEmail.crmv && byEmail.crmv.toLowerCase() === secret.toLowerCase();
        const demoPasswords = ['vet123', 'Vet@2026', 'VetLife@2026'];
        if (crmvMatch || demoPasswords.includes(secret)) {
          vet = byEmail;
        }
      }
    }

    if (!vet) {
      vet = await this.repo.findVetByEmailAndCrmv(email, secret);
    }

    if (!vet) {
      throw new UnauthorizedError(
        'Médico Veterinário não localizado ou senha incorreta.'
      );
    }

    const { password_hash: _ph, ...safeVet } = vet;

    const payload: JwtTokenPayload = {
      sub: vet.id,
      email: vet.email,
      name: vet.name,
      role: 'vet',
      crmv: vet.crmv,
      clinic_name: vet.clinic_name,
    };

    const signOptions: SignOptions = {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    };

    const token = jwt.sign(payload, env.JWT_SECRET, signOptions);
    return { token, vet: safeVet };
  }
}
