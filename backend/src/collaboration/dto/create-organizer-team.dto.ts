import { IsString, IsOptional, IsObject, IsArray } from 'class-validator';

export class CreateOrganizerTeamDto {
  @IsString()
  eventId: string;

  @IsString()
  teamName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  settings?: {
    allowGuestAccess?: boolean;
    requireApproval?: boolean;
    maxMembers?: number;
  };

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];
}
