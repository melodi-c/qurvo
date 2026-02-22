import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BillingService } from '../../billing/billing.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { BillingStatusDto } from '../dto/billing.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('api/projects/:projectId/billing')
@UseGuards(SessionAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  async getStatus(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
  ): Promise<BillingStatusDto> {
    return this.billingService.getStatus(user.user_id, projectId) as any;
  }
}
