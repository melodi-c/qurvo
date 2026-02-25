import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BillingService } from '../../billing/billing.service';
import { BillingStatusDto } from '../dto/billing.dto';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('api/projects/:projectId/billing')
@UseGuards(ProjectMemberGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  async getStatus(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<BillingStatusDto> {
    return this.billingService.getStatus(projectId, user.user_id) as any;
  }
}
