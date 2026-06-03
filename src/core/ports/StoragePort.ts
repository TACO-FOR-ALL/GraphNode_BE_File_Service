import { Readable } from 'stream';

export interface S3ObjectHead {
  contentLength: number;
  contentType?: string;
  etag?: string;
}

export interface StoragePort {
  upload(key: string, body: Buffer | Readable, contentType?: string): Promise<void>;
  uploadJson(key: string, data: unknown): Promise<void>;
  downloadToFile(key: string, destPath: string): Promise<void>;
  downloadJson<T>(key: string): Promise<T>;
  headObject(key: string): Promise<S3ObjectHead | null>;
  getPresignedGetUrl(key: string, ttlSec: number, opts?: { disposition?: string }): Promise<string>;
  getPresignedPutUrl(
    key: string,
    ttlSec: number,
    opts: { contentType: string; contentLength: number }
  ): Promise<string>;
}
