import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "@/lib/logger";

type StoredObject = {
  bucket: string;
  key: string;
  url: string;
  provider: "s3" | "local";
};

const localStorageRoot = path.join(process.cwd(), ".rag_uploads");

function getBucket() {
  return process.env.S3_BUCKET || "owly-rag";
}

function getS3Client() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    endpoint,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export function buildObjectKey(input: {
  documentId: string;
  fileName: string;
}) {
  const safeName = input.fileName
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);

  return `knowledge-documents/${input.documentId}/${safeName || "source"}`;
}

export async function storeObject(input: {
  key: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
}): Promise<StoredObject> {
  const bucket = getBucket();
  const client = getS3Client();

  if (client) {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Body: input.buffer,
          ContentType: input.contentType || "application/octet-stream",
          Metadata: {
            fileName: input.fileName,
          },
        })
      );

      const publicEndpoint =
        process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || "";
      const url = publicEndpoint
        ? `${publicEndpoint.replace(/\/$/, "")}/${bucket}/${input.key}`
        : "";

      return { bucket, key: input.key, url, provider: "s3" };
    } catch (error) {
      logger.warn("S3 storage failed, falling back to local storage", {
        error: String(error),
      });
    }
  }

  const filePath = path.join(localStorageRoot, input.key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.buffer);

  return {
    bucket: "local",
    key: input.key,
    url: filePath,
    provider: "local",
  };
}

export async function readObject(input: {
  bucket: string;
  key: string;
}): Promise<Buffer> {
  if (input.bucket && input.bucket !== "local") {
    const client = getS3Client();
    if (!client) {
      throw new Error("S3 is not configured for reading stored document.");
    }

    const response = await client.send(
      new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
      })
    );

    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  return readFile(path.join(localStorageRoot, input.key));
}

export async function getObjectPreviewUrl(input: {
  bucket: string;
  key: string;
  expiresIn?: number;
}): Promise<string> {
  if (!input.key) return "";

  if (input.bucket && input.bucket !== "local") {
    const client = getS3Client();
    if (!client) return "";

    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
      { expiresIn: input.expiresIn || 300 }
    );
  }

  return "";
}
