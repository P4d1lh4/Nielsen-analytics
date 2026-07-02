import { readFileSync } from "node:fs";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** Presigned screenshot URLs expire after this many seconds. */
const PRESIGN_TTL_SECONDS = 3600;

/**
 * S3-compatible object storage (Supabase Storage / MinIO) for screenshots.
 * The bucket is PRIVATE; objects are served via short-lived presigned URLs.
 * Configured from env: S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY,
 * S3_BUCKET_NAME. Optional S3_PUBLIC_ENDPOINT is a host-reachable endpoint used
 * only for signing (MinIO split-horizon: internal `minio:9000` for upload,
 * `localhost:9000` for the browser loading the presigned URL).
 */
export class StorageService {
  private readonly client: S3Client;
  private readonly signer: S3Client;
  private readonly bucket: string;

  constructor() {
    const endpoint = required("S3_ENDPOINT");
    this.bucket = required("S3_BUCKET_NAME");
    const config = {
      region: process.env.S3_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: required("S3_ACCESS_KEY"),
        secretAccessKey: required("S3_SECRET_KEY"),
      },
      forcePathStyle: true, // required for Supabase / MinIO S3 compatibility
    };
    this.client = new S3Client({ ...config, endpoint });
    const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT;
    this.signer = publicEndpoint ? new S3Client({ ...config, endpoint: publicEndpoint }) : this.client;
  }

  /** Uploads a local PNG to `key` in the private bucket and returns the key. */
  async uploadScreenshot(filePath: string, key: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: readFileSync(filePath),
        ContentType: "image/png",
      }),
    );
    return key;
  }

  /** A short-lived presigned GET URL for a stored object key. */
  presign(key: string): Promise<string> {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: PRESIGN_TTL_SECONDS,
    });
  }

  /**
   * Lists and deletes EVERY object under a job's prefix (`reports/job_<id>/`).
   * Paginates the listing and batches deletes (S3 allows 1000 keys per request).
   */
  async deleteJobArtifacts(jobId: string): Promise<void> {
    const prefix = `reports/job_${jobId}/`;
    const keys: { Key: string }[] = [];
    let ContinuationToken: string | undefined;
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken }),
      );
      for (const obj of listed.Contents ?? []) {
        if (obj.Key) keys.push({ Key: obj.Key });
      }
      ContinuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (ContinuationToken);

    if (keys.length === 0) return;

    for (let i = 0; i < keys.length; i += 1000) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.slice(i, i + 1000), Quiet: true },
        }),
      );
    }
  }
}

// Lazily-built singleton: the S3 env is only required once storage is used.
let instance: StorageService | undefined;

/** Uploads `filePath` to `key` and returns the stored key. */
export function uploadScreenshot(filePath: string, key: string): Promise<string> {
  instance ??= new StorageService();
  return instance.uploadScreenshot(filePath, key);
}

/** Short-lived presigned GET URL for a stored screenshot key. */
export function presignScreenshot(key: string): Promise<string> {
  instance ??= new StorageService();
  return instance.presign(key);
}

/** Replaces each step's stored S3 key with a fresh presigned URL, in place. */
export async function presignReportScreenshots<S extends { screenshot_url: string }>(
  steps: S[],
  presign: (key: string) => Promise<string> = presignScreenshot,
): Promise<void> {
  await Promise.all(
    steps.map(async (s) => {
      s.screenshot_url = await presign(s.screenshot_url);
    }),
  );
}

/** Deletes all stored artifacts (screenshots) under a job's `reports/job_<id>/` prefix. */
export function deleteJobArtifacts(jobId: string): Promise<void> {
  instance ??= new StorageService();
  return instance.deleteJobArtifacts(jobId);
}
