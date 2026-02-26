import { Controller, Post, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { NotificationService } from '../../notifications/notification.service';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { TestNotificationDto } from '../dto/notifications.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('api/projects/:projectId/notifications')
@UseGuards(ProjectMemberGuard)
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('test')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async testNotification(
    @Param('projectId') _projectId: string,
    @Body() body: TestNotificationDto,
  ): Promise<void> {
    await this.notificationService.sendTest(body.channel_type, body.channel_config);
  }
}
