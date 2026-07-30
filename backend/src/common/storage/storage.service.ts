import { Injectable, Logger, BadRequestException } from '@nestjs/common';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  async uploadFile(file: Express.Multer.File, folder = 'events'): Promise<string> {
    if (!file) throw new BadRequestException('No file provided');
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG and PNG images are allowed');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds 5MB limit');
    }

    const filename = `${folder}/${Date.now()}-${file.originalname}`;
    this.logger.log(`Mock S3 upload for ${filename}`);
    return `https://cdn.lumentix.io/${filename}`;
  }
}
