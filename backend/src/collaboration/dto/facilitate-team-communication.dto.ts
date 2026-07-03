import { IsString, IsOptional, IsEnum, IsArray, IsObject } from 'class-validator';

export class SendMessageDto {
  @IsString()
  teamId: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsEnum(['text', 'image', 'file', 'system'])
  messageType?: 'text' | 'image' | 'file' | 'system';

  @IsOptional()
  @IsString()
  replyTo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateMessageDto {
  @IsString()
  content: string;
}

export class AddReactionDto {
  @IsString()
  emoji: string;
}
