import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RetentionService } from '../../retention/retention.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { RetentionQueryDto, RetentionResponseDto } from '../dto/retention.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(SessionAuthGuard)
export class RetentionController {
  constructor(private readonly retentionService: RetentionService) {}

  @Post('retention')
  @HttpCode(200)
  async getRetention(
    @CurrentUser() user: RequestUser,
    @Body() body: RetentionQueryDto,
  ): Promise<RetentionResponseDto> {
    return this.retentionService.getRetention(user.user_id, body);
  }
}
