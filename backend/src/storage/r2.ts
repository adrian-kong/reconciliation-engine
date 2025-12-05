import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';

// ============ Configuration ============

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

// ============ R2 Storage Client ============

export class R2Storage {
  private client: S3Client;
  private bucketName: string;

  constructor(config: R2Config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucketName = config.bucketName;
  }

  /**
   * Upload a file to R2
   */
  async upload(
    buffer: Buffer,
    options: {
      fileName?: string;
      prefix?: string;
      contentType?: string;
      metadata?: Record<string, string>;
    } = {}
  ): Promise<UploadResult> {
    const fileId = nanoid();
    const extension = options.fileName?.split('.').pop() || 'pdf';
    const key = options.prefix 
      ? `${options.prefix}/${fileId}.${extension}`
      : `${fileId}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: options.contentType || 'application/pdf',
      Metadata: {
        ...options.metadata,
        originalName: options.fileName || 'unknown',
        uploadedAt: new Date().toISOString(),
      },
    });

    await this.client.send(command);

    return {
      key,
      fileId,
      size: buffer.length,
      contentType: options.contentType || 'application/pdf',
    };
  }

  /**
   * Get a file from R2
   */
  async get(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.client.send(command);
    const bodyContents = await response.Body?.transformToByteArray();
    
    if (!bodyContents) {
      throw new Error(`Failed to get file: ${key}`);
    }

    return Buffer.from(bodyContents);
  }

  /**
   * Get file metadata
   */
  async getMetadata(key: string): Promise<FileMetadata> {
    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.client.send(command);
    
    return {
      key,
      size: response.ContentLength || 0,
      contentType: response.ContentType || 'application/octet-stream',
      lastModified: response.LastModified,
      metadata: response.Metadata,
    };
  }

  /**
   * Generate a presigned URL for upload
   */
  async getUploadUrl(
    key: string,
    options: { expiresIn?: number; contentType?: string } = {}
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: options.contentType || 'application/pdf',
    });

    return getSignedUrl(this.client, command, {
      expiresIn: options.expiresIn || 3600,
    });
  }

  /**
   * Generate a presigned URL for download
   */
  async getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Delete a file from R2
   */
  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * List files with optional prefix
   */
  async list(prefix?: string, maxKeys: number = 100): Promise<FileListResult> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
      MaxKeys: maxKeys,
    });

    const response = await this.client.send(command);

    return {
      files: (response.Contents || []).map(obj => ({
        key: obj.Key || '',
        size: obj.Size || 0,
        lastModified: obj.LastModified,
      })),
      isTruncated: response.IsTruncated || false,
      nextContinuationToken: response.NextContinuationToken,
    };
  }
}

// ============ Types ============

export interface UploadResult {
  key: string;
  fileId: string;
  size: number;
  contentType: string;
}

export interface FileMetadata {
  key: string;
  size: number;
  contentType: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export interface FileListResult {
  files: {
    key: string;
    size: number;
    lastModified?: Date;
  }[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}

// ============ Singleton Instance ============

let r2Instance: R2Storage | null = null;

export function initR2(config: R2Config): R2Storage {
  r2Instance = new R2Storage(config);
  return r2Instance;
}

export function getR2(): R2Storage {
  if (!r2Instance) {
    // Return a mock instance for development if not configured
    console.warn('R2 not configured, using mock storage');
    return createMockR2Storage();
  }
  return r2Instance;
}

// ============ Mock Storage for Development ============

function createMockR2Storage(): R2Storage {
  const mockStorage = new Map<string, { buffer: Buffer; metadata: FileMetadata }>();

  return {
    async upload(buffer, options = {}) {
      const fileId = nanoid();
      const key = options.prefix ? `${options.prefix}/${fileId}.pdf` : `${fileId}.pdf`;
      mockStorage.set(key, {
        buffer,
        metadata: {
          key,
          size: buffer.length,
          contentType: options.contentType || 'application/pdf',
          lastModified: new Date(),
        },
      });
      return { key, fileId, size: buffer.length, contentType: options.contentType || 'application/pdf' };
    },
    async get(key) {
      const item = mockStorage.get(key);
      if (!item) throw new Error(`File not found: ${key}`);
      return item.buffer;
    },
    async getMetadata(key) {
      const item = mockStorage.get(key);
      if (!item) throw new Error(`File not found: ${key}`);
      return item.metadata;
    },
    async getUploadUrl() {
      return 'mock://upload-url';
    },
    async getDownloadUrl() {
      return 'mock://download-url';
    },
    async delete(key) {
      mockStorage.delete(key);
    },
    async list(prefix) {
      const files = Array.from(mockStorage.entries())
        .filter(([k]) => !prefix || k.startsWith(prefix))
        .map(([key, item]) => ({
          key,
          size: item.metadata.size,
          lastModified: item.metadata.lastModified,
        }));
      return { files, isTruncated: false };
    },
  } as R2Storage;
}

