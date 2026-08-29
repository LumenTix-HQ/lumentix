import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { GiftWrapStyle } from '../ticket-gift.entity';

export class WrapTicketGiftDto {
  @ApiProperty({ description: 'User the ticket is being gifted to' })
  @IsUUID()
  recipientId: string;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiProperty({ required: false, enum: GiftWrapStyle, default: GiftWrapStyle.CLASSIC })
  @IsOptional()
  @IsEnum(GiftWrapStyle)
  wrapStyle?: GiftWrapStyle;

  @ApiProperty({
    required: false,
    description:
      'When to release the gift. Omit to deliver immediately; must fall before the event starts.',
  })
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
}

export class ScheduleGiftDeliveryDto {
  @ApiProperty({ description: 'New delivery date, before the event starts' })
  @IsDateString()
  scheduledFor: string;
}
