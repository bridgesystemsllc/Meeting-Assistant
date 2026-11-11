export class WorkerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerConfigError';
  }
}

export function appDatabaseUrl(): string {
  const url = process.env.APP_DATABASE_URL;
  if (!url) {
    throw new WorkerConfigError(
      'APP_DATABASE_URL is required (NOBYPASSRLS app role; no fallback to DATABASE_URL)'
    );
  }
  return url;
}

export function assertWorkerRuntimeEnv(): void {
  appDatabaseUrl();
}
