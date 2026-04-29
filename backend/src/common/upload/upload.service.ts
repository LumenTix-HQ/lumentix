import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class UploadService {
  private readonly uploadPath: string;

  constructor(private readonly configService: ConfigService) {
    this.uploadPath =
      this.configService.get<string>('UPLOAD_PATH') ?? 'uploads';
    fs.mkdirSync(this.uploadPath, { recursive: true });
  }

  async saveFile(file: Express.Multer.File): Promise<string> {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed: ${ALLOWED_MIME.join(', ')}`,
      );
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('File exceeds 5 MB limit');
    }

    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${randomUUID()}${ext}`;
    const dest = path.join(this.uploadPath, filename);
    fs.writeFileSync(dest, file.buffer);

    return `/${this.uploadPath}/${filename}`;
  }
}
