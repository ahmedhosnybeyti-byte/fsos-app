import { Injectable } from "@nestjs/common";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { AppConfigService } from "../../../common/config";
import type { StorageProvider, UploadObjectParams } from "./storage-provider.interface";

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: AppConfigService) {
    const storage = config.values.storage;
    this.bucket = storage.bucket;
    this.client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
      // 2026-07-20 incident: the AWS SDK v3's default HTTP handler has NO
      // request/connection timeout at all — when the storage endpoint
      // (local MinIO in dev) is unreachable or half-up, every call that
      // touches file bytes (download/upload/presign) hung forever with no
      // error, which looked identical to a frontend bug from the outside
      // (a Daily Brief request stuck at "Pending" indefinitely). Explicit
      // timeouts make that failure mode fail fast with a real error instead.
      requestHandler: new NodeHttpHandler({ connectionTimeout: 5_000, requestTimeout: 15_000 }),
    });
  }

  async upload(params: UploadObjectParams): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const stream = response.Body as unknown as AsyncIterable<Uint8Array>;
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
