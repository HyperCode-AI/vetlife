import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JwtTokenPayload } from '../../application/use-cases/AuthUseCases';
import { env } from '../../config/env';
import { AuthRole } from '../../domain/entities';
import { ForbiddenError, UnauthorizedError } from '../../domain/errors/AppError';

declare global {
  namespace Express {
    interface Request {
      authUser?: JwtTokenPayload;
    }
  }
}

export function extractTokenFromHeader(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
    return parts[1].trim();
  }
  return authHeader.trim();
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractTokenFromHeader(req);
  if (!token) {
    return next(
      new UnauthorizedError('Faça login para acessar esta área.')
    );
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtTokenPayload;
    req.authUser = decoded;
    return next();
  } catch {
    return next(new UnauthorizedError('Sua sessão expirou. Faça login novamente para continuar.'));
  }
}

export function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractTokenFromHeader(req);
  if (!token) {
    return next();
  }
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtTokenPayload;
    req.authUser = decoded;
  } catch {
    // Ignore invalid optional token on public/hybrid read routes
  }
  return next();
}

/**
 * RBAC Middleware enforcing RN-01:
 * Settings routes (Exams, Dynamic Input Fields, Price Tables, References, Report Templates)
 * and Financial Dashboard are strictly restricted to role 'admin'.
 */
export function requireRole(...allowedRoles: AuthRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      return next(new UnauthorizedError('Faça login para acessar este recurso.'));
    }

    if (!allowedRoles.includes(req.authUser.role)) {
      return next(
        new ForbiddenError(
          'Você não tem permissão para realizar esta ação. Caso precise de acesso, fale com um administrador.'
        )
      );
    }

    return next();
  };
}
