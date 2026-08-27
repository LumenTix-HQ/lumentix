import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsObject, IsString, Min, ValidateNested } from 'class-validator';

export class WorkspaceChangeInputDto {
  @ApiProperty({ description: 'Which part of the workspace this change targets, e.g. "title", "task", "comment"' })
  @IsString()
  @IsNotEmpty()
  field: string;

  @ApiProperty({ description: 'Arbitrary change payload for the targeted field' })
  @IsObject()
  payload: Record<string, unknown>;

  @ApiProperty({ description: 'Workspace version the client had loaded when it made this edit' })
  @IsInt()
  @Min(0)
  baseVersion: number;
}

export class SyncWorkspaceChangesDto {
  @ApiProperty({ type: [WorkspaceChangeInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkspaceChangeInputDto)
  changes: WorkspaceChangeInputDto[];
}
