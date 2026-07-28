import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null = null;
  private readonly bucket: string;
  private readonly region: string;
  private readonly cdnBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('STORAGE_BUCKET') ?? '';
    this.region = this.configService.get<string>('STORAGE_REGION') ?? '';
    this.cdnBaseUrl =
      this.configService.get<string>('CDN_BASE_URL') ?? '';

    const key = this.configService.get<string>('STORAGE_KEY');
    const secret = this.configService.get<string>('STORAGE_SECRET');

    if (this.bucket && this.region && key && secret) {
      this.client = new S3Client({
        region: this.region,
        credentials: { accessKeyId: key, secretAccessKey: secret },
      });
      this.logger.log(`S3 client initialised → bucket=${this.bucket} region=${this.region}`);
    } else {
      this.logger.warn('S3 not configured — StorageService will reject uploads');
    }
  }

  async upload(
    file: Express.Multer.File,
    prefix = 'events',
  ): Promise<{ url: string; key: string }> {
    if (!this.client) {
      throw new BadRequestException('S3 storage is not configured');
    }

    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed: ${ALLOWED_MIME.join(', ')}`,
      );
    }

    if (file.size > MAX_SIZE) {
      throw new BadRequestException('File exceeds 5 MB limit');
    }

    const ext = this.extFromMime(file.mimetype);
    const key = `${prefix}/${randomUUID()}${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const url = this.cdnBaseUrl
      ? `${this.cdnBaseUrl}/${key}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    this.logger.debug(`Uploaded → ${url}`);
    return { url, key };
  }

  private extFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    return map[mime] ?? '.jpg';
  }
}
