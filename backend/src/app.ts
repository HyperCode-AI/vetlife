import cors from 'cors';
import express, { Application, Request, Response } from 'express';
import { env } from './config/env';
import { errorHandler } from './presentation/middlewares/errorHandler';
import { createApiV1Router } from './presentation/routes';

export function createApp(): Application {
  const app = express();

  const defaultAllowedOrigins = [
    'https://vetlifelab.com.br',
    'https://www.vetlifelab.com.br',
    'https://app.vetlifelab.com.br',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:3001',
  ];

  const configuredOrigins =
    env.CORS_ORIGIN === '*'
      ? '*'
      : Array.from(
          new Set([
            ...defaultAllowedOrigins,
            ...env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
          ])
        );

  app.use(
    cors({
      origin: configuredOrigins === '*' ? true : configuredOrigins,
      credentials: true,
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Root API status
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      success: true,
      service: 'VetLife Backend API',
      domain: 'vetlifelab.com.br',
      status: 'ok',
    });
  });

  // Main API v1 routes
  app.use('/api/v1', createApiV1Router());

  // 404 handler for unknown API routes
  app.use('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Endpoint '${req.method} ${req.originalUrl}' não encontrado na API VetLife.`,
      },
    });
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
