import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import type { FileStorageBackend } from "./file-storage.types";

export type BucketStorageConfig = {
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  endpoint: string;
};

export function readBucketStorageConfig(
  env: Partial<Record<string, string | undefined>>
): BucketStorageConfig {
  const bucket = env.STORAGE_BUCKET_NAME?.trim();
  const accessKeyId = env.STORAGE_BUCKET_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.STORAGE_BUCKET_SECRET_ACCESS_KEY?.trim();
  const region = env.STORAGE_BUCKET_REGION?.trim() || "auto";
  const endpoint = env.STORAGE_BUCKET_ENDPOINT?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("STORAGE_BACKEND_UNAVAILABLE");
  }
  return { bucket, accessKeyId, secretAccessKey, region, endpoint };
}

export function createRailwayBucketStorage(
  env: NodeJS.ProcessEnv
): FileStorageBackend {
  const config = readBucketStorageConfig(env);
  const client = new S3Client({
    region: config.region,
    endpoint: normalizeEndpoint(config.endpoint),
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });

  return {
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType || "application/octet-stream"
        })
      );
    },
    async get(key) {
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key })
        );
        if (!response.Body) throw new Error("FILE_NOT_FOUND");
        return Buffer.from(await response.Body.transformToByteArray());
      } catch (error) {
        if (isMissingObject(error)) throw new Error("FILE_NOT_FOUND");
        throw error;
      }
    },
    async delete(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: key })
      );
    }
  };
}

function normalizeEndpoint(value: string) {
  return /^https?:\/\//iu.test(value) ? value : `https://${value}`;
}

function isMissingObject(error: unknown) {
  const value = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
    message?: string;
  };
  return (
    value?.name === "NoSuchKey" ||
    value?.name === "NotFound" ||
    value?.$metadata?.httpStatusCode === 404 ||
    value?.message === "FILE_NOT_FOUND"
  );
}
