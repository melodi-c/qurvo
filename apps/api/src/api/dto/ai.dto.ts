import { IsString, IsNotEmpty, IsOptional, IsUUID, IsInt, IsBoolean, IsIn, Min, Max, MaxLength, MinLength } from 'class-validator';
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
  @ApiPropertyOptional({
    enum: [
      'trend_chart',
      'funnel_chart',
      'funnel_gap_chart',
      'retention_chart',
      'lifecycle_chart',
      'stickiness_chart',
      'paths_chart',
      'root_cause_chart',
      'segment_compare_chart',
      'histogram_chart',
    ],
    nullable: true,
  })
  visualization_type:
    | 'trend_chart'
    | 'funnel_chart'
    | 'funnel_gap_chart'
    | 'retention_chart'
    | 'lifecycle_chart'
    | 'stickiness_chart'
    | 'paths_chart'
    | 'root_cause_chart'
    | 'segment_compare_chart'
    | 'histogram_chart'
    | null;
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

export class AiConversationSearchQueryDto {
  @IsUUID()
  project_id: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  q: string;
}

export class AiConversationSearchResultDto {
  id: string;
  title: string;
  snippet: string;
  matched_at: string;
}

export class AiMessageFeedbackDto {
  @ApiProperty({ enum: ['positive', 'negative'] })
  @IsIn(['positive', 'negative'])
  rating: 'positive' | 'negative';

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  comment?: string;
}

export class AiMessageFeedbackResponseDto {
  id: string;
  message_id: string;
  user_id: string;
  @ApiProperty({ enum: ['positive', 'negative'] })
  rating: 'positive' | 'negative';
  @ApiPropertyOptional()
  comment: string | null;
  created_at: string;
}
