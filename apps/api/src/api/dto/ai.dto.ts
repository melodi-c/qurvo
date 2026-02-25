import { IsString, IsNotEmpty, IsOptional, IsUUID, IsInt, IsBoolean, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AiChatDto {
  @IsUUID()
  project_id: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  conversation_id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  message: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  edit_sequence?: number;
}

export class AiConversationsQueryDto {
  @IsUUID()
  project_id: string;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  shared?: boolean;
}

export class AiConversationDto {
  id: string;
  title: string;
  @ApiProperty()
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export class AiSharedConversationDto extends AiConversationDto {
  owner_name: string;
}

export class AiMessageDto {
  id: string;
  @ApiProperty({ enum: ['user', 'assistant', 'tool'] })
  role: 'user' | 'assistant' | 'tool';
  @ApiPropertyOptional() content: string | null;
  @ApiPropertyOptional() tool_calls: unknown;
  @ApiPropertyOptional() tool_call_id: string | null;
  @ApiPropertyOptional() tool_name: string | null;
  @ApiPropertyOptional() tool_result: unknown;
  @ApiPropertyOptional() visualization_type: string | null;
  sequence: number;
  created_at: string;
}

export class AiConversationAccessDto {
  @IsUUID()
  project_id: string;
}

export class AiConversationMessagesQueryDto extends AiConversationAccessDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 30;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  before_sequence?: number;
}

export class AiConversationDetailDto extends AiConversationDto {
  @ApiPropertyOptional()
  owner_name?: string;
  @ApiProperty({ type: [AiMessageDto] })
  messages: AiMessageDto[];
  has_more: boolean;
}

export class UpdateConversationDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  is_shared?: boolean;
}
