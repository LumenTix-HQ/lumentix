import { IsString, IsUUID, IsOptional, IsNumber, IsPositive, MaxLength, MinLength } from 'class-validator';

export class ConnectChatDto {
  @IsUUID()
  eventId: string;
}

export class BroadcastMessageDto {
  @IsUUID()
  eventId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message: string;
}

export class BanUserDto {
  @IsUUID()
  eventId: string;

  @IsString()
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SetSlowModeDto {
  @IsUUID()
  eventId: string;

  @IsNumber()
  @IsPositive()
  delaySeconds: number;
}

export class ModerateContentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  userId?: string;
}
