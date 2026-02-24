import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BillingService } from '../../billing/billing.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { BillingStatusDto } from '../dto/billing.dto';
import { ProjectMemberGuard } from '../guards/project-member.guard';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('api/projects/:projectId/billing')
@UseGuards(ProjectMemberGuard)
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
