import { randomBytes } from "node:crypto";
import { extname } from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { mediaUploadConfig } from "../config/env";

const IMAGE_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
};

const VIDEO_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-m4v": ".m4v",
  "video/ogg": ".ogv",
};

let storageClient: S3Client | null = null;

export class MediaUploadError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "MediaUploadError";
  }
}

interface PresignMediaUploadInput {
  contentType: string;
  fileName: string;
  projectId: string;
}

type MediaUploadKind = "image" | "video";

function getStorageClient() {
  if (
    !mediaUploadConfig.enabled ||
    !mediaUploadConfig.accessKeyId ||
    !mediaUploadConfig.secretAccessKey ||
    !mediaUploadConfig.endpoint ||
    !mediaUploadConfig.region
  ) {
    throw new MediaUploadError("Media uploads are not configured on the server yet.", 503);
  }

  if (!storageClient) {
    storageClient = new S3Client({
      region: mediaUploadConfig.region,
      endpoint: mediaUploadConfig.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: mediaUploadConfig.accessKeyId,
        secretAccessKey: mediaUploadConfig.secretAccessKey,
      },
    });
  }

  return storageClient;
}

function sanitizePathSegment(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized.length > 0 ? normalized : fallback;
}

function resolveMediaExtension(fileName: string, contentType: string, kind: MediaUploadKind) {
  const rawExtension = extname(fileName).trim().toLowerCase();
  if (rawExtension.length > 0 && /^[.][a-z0-9]{1,10}$/.test(rawExtension)) {
    return rawExtension;
  }

  const extensionMap = kind === "image" ? IMAGE_EXTENSION_BY_CONTENT_TYPE : VIDEO_EXTENSION_BY_CONTENT_TYPE;
  return extensionMap[contentType] ?? ".bin";
}

function encodeObjectKey(key: string) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildPublicUrl(bucket: string, key: string) {
  const baseUrl = mediaUploadConfig.publicBaseUrl;
  if (!baseUrl) {
    throw new MediaUploadError("Media uploads are missing a usable public base URL.", 503);
  }

  return `${baseUrl}/${encodeURIComponent(bucket)}/${encodeObjectKey(key)}`;
}

function createObjectKey(projectId: string, fileName: string, contentType: string, kind: MediaUploadKind) {
  const now = new Date();
  const year = now.getUTCFullYear().toString();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const projectSegment = sanitizePathSegment(projectId, "project");
  const nameWithoutExtension = fileName.replace(/\.[^.]+$/, "");
  const fileSegment = sanitizePathSegment(nameWithoutExtension, kind);
  const extension = resolveMediaExtension(fileName, contentType, kind);
  const randomSuffix = randomBytes(6).toString("hex");
  const folder = kind === "image" ? "images" : "videos";

  return `projects/${projectSegment}/${folder}/${year}/${month}/${Date.now()}-${randomSuffix}-${fileSegment}${extension}`;
}

async function presignMediaUpload(input: PresignMediaUploadInput, kind: MediaUploadKind) {
  const contentType = input.contentType.trim().toLowerCase();
  if (!contentType.startsWith(`${kind}/`)) {
    throw new MediaUploadError(`Only ${kind} uploads are supported by the media bucket.`);
  }

  const fileName = input.fileName.trim();
  if (fileName.length === 0) {
    throw new MediaUploadError(`${kind === "image" ? "Image" : "Video"} uploads require a file name.`);
  }

  const bucket = mediaUploadConfig.bucket;
  if (!bucket) {
    throw new MediaUploadError("Media uploads are not configured on the server yet.", 503);
  }

  const key = createObjectKey(input.projectId, fileName, contentType, kind);
  const client = getStorageClient();
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: mediaUploadConfig.presignTtlSeconds },
  );

  return {
    expiresInSeconds: mediaUploadConfig.presignTtlSeconds,
    headers: {
      "Content-Type": contentType,
    },
    key,
    method: "PUT" as const,
    publicUrl: buildPublicUrl(bucket, key),
    uploadUrl,
  };
}

export async function presignImageUpload(input: PresignMediaUploadInput) {
  return presignMediaUpload(input, "image");
}

export async function presignVideoUpload(input: PresignMediaUploadInput) {
  return presignMediaUpload(input, "video");
}
