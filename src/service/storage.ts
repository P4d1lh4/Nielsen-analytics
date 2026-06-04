import { readFileSync } from "node:fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/**
 * S3-compatible object storage (Supabase Storage via the S3 API) for screenshots.
 * Configured entirely from env: S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY,
 * S3_SECRET_KEY, S3_BUCKET_NAME.
 */
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor() {
    this.endpoint = required("S3_ENDPOINT");
    this.bucket = required("S3_BUCKET_NAME");
    this.client = new S3Client({
      endpoint: this.endpoint,
      region: process.env.S3_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: required("S3_ACCESS_KEY"),
        secretAccessKey: required("S3_SECRET_KEY"),
      },
      forcePathStyle: true, // required for Supabase / MinIO S3 compatibility
    });
  }

  /** Uploads a local PNG to `key` in the bucket and returns its public URL. */
  async uploadScreenshot(filePath: string, key: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: readFileSync(filePath),
        ContentType: "image/png",
      }),
    );
    return this.publicUrl(key);
  }

  /**
   * Public URL of an uploaded object. Resolution order:
   *  1. `S3_PUBLIC_URL` base, if set (any CDN / custom domain).
   *  2. Supabase: `<origin>/storage/v1/object/public/<bucket>/<key>`.
   *  3. Generic S3 / MinIO: path-style `<endpoint>/<bucket>/<key>`.
   */
  private publicUrl(key: string): string {
    const base = process.env.S3_PUBLIC_URL;
    if (base) return `${base.replace(/\/+$/, "")}/${key}`;
    if (/supabase\./i.test(this.endpoint)) {
      return `${new URL(this.endpoint).origin}/storage/v1/object/public/${this.bucket}/${key}`;
    }
    return `${this.endpoint.replace(/\/+$/, "")}/${this.bucket}/${key}`;
  }
}

// Lazily-built singleton: the S3 env is only required once an upload actually runs.
let instance: StorageService | undefined;

/** Uploads `filePath` to `key` and returns the public URL. */
export function uploadScreenshot(filePath: string, key: string): Promise<string> {
  instance ??= new StorageService();
  return instance.uploadScreenshot(filePath, key);
}
