import { IsString, IsOptional, IsEnum, IsArray, IsObject } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  teamId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['todo', 'in_progress', 'review', 'completed', 'cancelled'])
  status?: 'todo' | 'in_progress' | 'review' | 'completed' | 'cancelled';

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsObject()
  attachments?: Array<{ name: string; url: string; type: string }>;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['todo', 'in_progress', 'review', 'completed', 'cancelled'])
  status?: 'todo' | 'in_progress' | 'review' | 'completed' | 'cancelled';

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsObject()
  attachments?: Array<{ name: string; url: string; type: string }>;

  @IsOptional()
  order?: number;
}
