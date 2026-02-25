import { Controller, Post, Get, Delete, Body, Param, Query, Res, Headers, UseGuards, Logger, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AiService } from '../../ai/ai.service';
import { AiRateLimitGuard } from '../../ai/guards/ai-rate-limit.guard';
import { detectLanguageFromHeader } from '../../ai/system-prompt';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { AiChatDto, AiConversationsQueryDto, AiConversationAccessDto, AiConversationDto, AiConversationDetailDto, AiConversationMessagesQueryDto } from '../dto/ai.dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('api/ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @UseGuards(AiRateLimitGuard)
  async chat(
    @CurrentUser() user: RequestUser,
    @Body() body: AiChatDto,
    @Res() reply: FastifyReply,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    // Validate access before sending SSE headers — allows proper HTTP error responses
    await this.aiService.validateChatAccess(user.user_id, body.project_id);

    const language = detectLanguageFromHeader(acceptLanguage);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    try {
      const stream = this.aiService.chat(user.user_id, {
        project_id: body.project_id,
        conversation_id: body.conversation_id,
        message: body.message,
        language,
        edit_sequence: body.edit_sequence,
      });

      for await (const chunk of stream) {
        if (reply.raw.destroyed) break;
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (err) {
      const internalMsg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`AI chat error: ${internalMsg}`, err instanceof Error ? err.stack : undefined);
      if (!reply.raw.destroyed) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: 'An internal error occurred' })}\n\n`);
      }
    } finally {
      if (!reply.raw.destroyed) {
        reply.raw.end();
      }
    }
  }

  @Get('conversations')
  @UseGuards(ProjectMemberGuard)
  async listConversations(
    @CurrentUser() user: RequestUser,
    @Query() query: AiConversationsQueryDto,
  ): Promise<AiConversationDto[]> {
    return this.aiService.listConversations(user.user_id, query.project_id) as any;
  }

  @Get('conversations/:id')
  @UseGuards(ProjectMemberGuard)
  async getConversation(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AiConversationMessagesQueryDto,
  ): Promise<AiConversationDetailDto> {
    return this.aiService.getConversation(user.user_id, id, query.project_id, query.limit, query.before_sequence) as any;
  }

  @Delete('conversations/:id')
  @UseGuards(ProjectMemberGuard)
  async deleteConversation(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AiConversationAccessDto,
  ): Promise<void> {
    await this.aiService.deleteConversation(user.user_id, id, query.project_id);
  }
}
