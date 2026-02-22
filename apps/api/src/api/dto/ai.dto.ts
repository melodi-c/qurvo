import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AiChatDto {
  @IsUUID()
  project_id: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  conversation_id?: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}

export class AiConversationsQueryDto {
  @IsUUID()
  project_id: string;
}

export class AiConversationDto {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export class AiMessageDto {
  id: string;
  role: string;
  @ApiPropertyOptional() content: string | null;
  @ApiPropertyOptional() tool_calls: unknown;
  @ApiPropertyOptional() tool_call_id: string | null;
  @ApiPropertyOptional() tool_name: string | null;
  @ApiPropertyOptional() tool_result: unknown;
  @ApiPropertyOptional() visualization_type: string | null;
  sequence: number;
  created_at: string;
}

export class AiConversationDetailDto extends AiConversationDto {
  messages: AiMessageDto[];
}
