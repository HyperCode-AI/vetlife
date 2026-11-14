import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../domain/errors/AppError';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    const formattedIssues = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    const firstIssue = formattedIssues[0];
    const detailedMessage = firstIssue
      ? firstIssue.field
        ? `Campo "${firstIssue.field}": ${firstIssue.message}`
        : firstIssue.message
      : 'Dados de entrada inválidos. Verifique os campos obrigatórios.';

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: detailedMessage,
        details: formattedIssues,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  const genericMessage =
    err instanceof Error ? err.message : 'Erro interno inesperado no servidor.';

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: genericMessage,
    },
  });
}
