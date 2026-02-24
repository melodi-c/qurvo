import { Controller, Post, Get, Delete, Body, Param, Query, Res, Logger } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AiService } from '../../ai/ai.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { AiChatDto, AiConversationsQueryDto, AiConversationDto, AiConversationDetailDto, AiConversationMessagesQueryDto } from '../dto/ai.dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('api/ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(
    @CurrentUser() user: RequestUser,
    @Body() body: AiChatDto,
    @Res() reply: FastifyReply,
  ) {
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
      });

      for await (const chunk of stream) {
        if (reply.raw.destroyed) break;
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`AI chat error: ${message}`, err instanceof Error ? err.stack : undefined);
      if (!reply.raw.destroyed) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
      }
    } finally {
      if (!reply.raw.destroyed) {
        reply.raw.end();
      }
    }
  }

  @Get('conversations')
  async listConversations(
    @CurrentUser() user: RequestUser,
    @Query() query: AiConversationsQueryDto,
  ): Promise<AiConversationDto[]> {
    return this.aiService.listConversations(user.user_id, query.project_id) as any;
  }

  @Get('conversations/:id')
  async getConversation(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query() query: AiConversationMessagesQueryDto,
  ): Promise<AiConversationDetailDto> {
    return this.aiService.getConversation(user.user_id, id, query.limit, query.before_sequence) as any;
  }

  @Delete('conversations/:id')
  async deleteConversation(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.aiService.deleteConversation(user.user_id, id);
  }
}
