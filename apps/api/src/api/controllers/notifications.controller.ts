import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { NotificationService } from '../../notifications/notification.service';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { TestNotificationDto, TestNotificationResponseDto } from '../dto/notifications.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('api/projects/:projectId/notifications')
@UseGuards(ProjectMemberGuard)
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('test')
  @ApiOkResponse({ type: TestNotificationResponseDto })
  async testNotification(
    @Param('projectId') _projectId: string,
    @Body() body: TestNotificationDto,
  ): Promise<TestNotificationResponseDto> {
    await this.notificationService.sendTest(body.channel_type, body.channel_config);
    return { ok: true };
  }
}
