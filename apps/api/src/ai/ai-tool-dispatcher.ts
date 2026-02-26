import * as crypto from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { AI_TOOLS } from './tools/ai-tool.interface';
import type { AiTool } from './tools/ai-tool.interface';
import { REDIS } from '../providers/redis.provider';
import { AI_TOOL_CACHE_TTL_SECONDS } from '../constants';

export interface AccumulatedToolCall {
  id: string;
  function: { name: string; arguments: string };
}

export interface DispatchedToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
  visualizationType?: string;
}

type AiToolDispatchChunk =
  | { type: 'tool_call_start'; tool_call_id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool_call_id: string; name: string; result: unknown; visualization_type?: string };

function isAiSafeError(err: unknown): err is Error & { isSafeForAi: true } {
  return err instanceof Error && 'isSafeForAi' in err && (err as { isSafeForAi: unknown }).isSafeForAi === true;
}

@Injectable()
export class AiToolDispatcher {
  private readonly logger = new Logger(AiToolDispatcher.name);
  readonly toolMap: Map<string, AiTool>;
  readonly toolDefinitions: import('openai/resources/chat/completions').ChatCompletionTool[];

  constructor(
    @Inject(AI_TOOLS) tools: AiTool[],
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    this.toolMap = new Map(tools.map((t) => [t.name, t]));
    this.toolDefinitions = tools.map((t) => t.definition());
  }

  async *dispatch(
    toolCalls: AccumulatedToolCall[],
    userId: string,
    projectId: string,
  ): AsyncGenerator<AiToolDispatchChunk, DispatchedToolResult[]> {
    const results: DispatchedToolResult[] = [];

    for (const tc of toolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        // args unavailable — yield empty object
      }
      yield { type: 'tool_call_start', tool_call_id: tc.id, name: tc.function.name, args: parsedArgs };

      let toolResult: unknown;
      let vizType: string | undefined;
      try {
        const args = parsedArgs;
        const tool = this.toolMap.get(tc.function.name);
        if (!tool) throw new Error(`Unknown tool: ${tc.function.name}`);

        if (tool.cacheable === true) {
          const cacheKey = this.buildToolCacheKey(tc.function.name, args, projectId);
          const cached = await this.redis.get(cacheKey);
          if (cached !== null) {
            const parsed = JSON.parse(cached) as { result: unknown; visualization_type?: string };
            toolResult = parsed.result;
            vizType = parsed.visualization_type;
            this.logger.debug({ tool: tc.function.name, cacheKey }, 'AI tool cache hit');
          } else {
            const res = await tool.run(args, userId, projectId);
            toolResult = res.result;
            vizType = res.visualization_type;
            await this.redis.set(
              cacheKey,
              JSON.stringify({ result: toolResult, visualization_type: vizType }),
              'EX',
              AI_TOOL_CACHE_TTL_SECONDS,
            );
          }
        } else {
          const res = await tool.run(args, userId, projectId);
          toolResult = res.result;
          vizType = res.visualization_type;
        }
      } catch (err) {
        this.logger.warn({ err, tool: tc.function.name }, `Tool ${tc.function.name} failed`);
        const safeMessage = isAiSafeError(err)
          ? err.message
          : 'The query failed. Please try a different approach.';
        toolResult = { error: safeMessage };
      }

      yield {
        type: 'tool_result',
        tool_call_id: tc.id,
        name: tc.function.name,
        result: toolResult,
        visualization_type: vizType,
      };

      results.push({ toolCallId: tc.id, toolName: tc.function.name, result: toolResult, visualizationType: vizType });
    }

    return results;
  }

  /**
   * Builds a stable Redis cache key for an AI tool call.
   * Uses SHA-256(tool_name + sorted JSON args + project_id) to ensure identical
   * queries with different key orderings produce the same cache key.
   */
  private buildToolCacheKey(toolName: string, args: Record<string, unknown>, projectId: string): string {
    const sortedArgs = JSON.stringify(args, Object.keys(args).sort());
    const hash = crypto.createHash('sha256').update(`${toolName}:${sortedArgs}:${projectId}`).digest('hex');
    return `ai:tool_cache:${hash}`;
  }
}
