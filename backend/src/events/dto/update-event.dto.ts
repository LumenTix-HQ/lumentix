import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsUrl } from 'class-validator';
import { CreateEventDto } from './create-event.dto';

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @ApiPropertyOptional({
    description: 'HTTPS endpoint that receives payment webhooks',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  webhookUrl?: string;
}
