import { IsString, IsUUID } from 'class-validator';

export class ConnectChatDto {
  @IsUUID()
  eventId: string;

  @IsString()
  userId: string;
}

export class BroadcastMessageDto {
  @IsUUID()
  eventId: string;

  @IsString()
  userId: string;

  @IsString()
  username: string;

  @IsString()
  message: string;
}
