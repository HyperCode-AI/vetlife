import dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  CORS_ORIGIN: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  isSupabaseConfigured: boolean;
}

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

export const env: EnvConfig = {
  PORT: Number(process.env.PORT) || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'vetlife-super-secret-jwt-key-2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: (process.env.SUPABASE_ANON_KEY || '').trim(),
  SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey,
  isSupabaseConfigured: Boolean(
    supabaseUrl &&
      supabaseServiceKey &&
      supabaseUrl.startsWith('http') &&
      !supabaseUrl.includes('your-project')
  ),
};
