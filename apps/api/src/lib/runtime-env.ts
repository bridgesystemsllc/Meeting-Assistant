export class RuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeConfigError';
  }
}

export function appDatabaseUrl(): string {
  const url = process.env.APP_DATABASE_URL;
  if (!url) {
    throw new RuntimeConfigError(
      'APP_DATABASE_URL is required (NOBYPASSRLS app role; no fallback to DATABASE_URL)'
    );
  }
  return url;
}

export function publicBaseUrl(): string {
  const configured = (process.env.PUBLIC_BASE_URL || process.env.OIDC_REDIRECT_BASE || '').replace(
    /\/$/,
    ''
  );
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new RuntimeConfigError('PUBLIC_BASE_URL is required in production');
  }
  return `http://localhost:${process.env.PORT || 3001}`;
}

export function assertApiRuntimeEnv(): void {
  appDatabaseUrl();
  if (process.env.NODE_ENV === 'production') {
    publicBaseUrl();
    if (!process.env.OIDC_STATE_SECRET) {
      throw new RuntimeConfigError('OIDC_STATE_SECRET is required in production');
    }
    if (process.env.OIDC_ALLOW_MOCK === 'true') {
      throw new RuntimeConfigError('OIDC_ALLOW_MOCK cannot be set when NODE_ENV=production');
    }
    if (!process.env.SMTP_HOST) {
      throw new RuntimeConfigError('SMTP_HOST is required in production');
    }
  }
}
