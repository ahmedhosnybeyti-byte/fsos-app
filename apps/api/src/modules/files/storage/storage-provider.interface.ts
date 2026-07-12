export const STORAGE_PROVIDER = Symbol("STORAGE_PROVIDER");

export interface UploadObjectParams {
  key: string;
  body: Buffer;
  contentType: string;
}

// S3-compatible abstraction — the same S3Provider implementation talks to
// local MinIO in dev and real S3/Cloudflare R2 in production; only env vars
// change. See docker-compose.yml (MinIO) and apps/api/.env.example.
export interface StorageProvider {
  upload(params: UploadObjectParams): Promise<void>;
  download(key: string): Promise<Buffer>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
