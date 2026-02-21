import { Controller, Get, Put, Body, Query, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UnitEconomicsService } from '../../unit-economics/unit-economics.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { UpsertUEConfigDto, UEConfigDto, UnitEconomicsQueryDto, UnitEconomicsResponseDto } from '../dto/unit-economics.dto';

@ApiTags('Unit Economics')
@ApiBearerAuth()
@Controller('api/projects/:projectId/unit-economics')
@UseGuards(SessionAuthGuard)
export class UnitEconomicsConfigController {
  constructor(private readonly unitEconomicsService: UnitEconomicsService) {}

  @Get('config')
  async getConfig(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
  ): Promise<UEConfigDto | null> {
    return this.unitEconomicsService.getConfig(user.user_id, projectId) as any;
  }

  @Put('config')
  async upsertConfig(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: UpsertUEConfigDto,
  ): Promise<UEConfigDto> {
    return this.unitEconomicsService.upsertConfig(user.user_id, projectId, body) as any;
  }
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(SessionAuthGuard)
export class UnitEconomicsController {
  constructor(private readonly unitEconomicsService: UnitEconomicsService) {}

  @Get('unit-economics')
  async getUnitEconomics(
    @CurrentUser() user: RequestUser,
    @Query() query: UnitEconomicsQueryDto,
  ): Promise<UnitEconomicsResponseDto> {
    return this.unitEconomicsService.getMetrics(user.user_id, query);
  }
}
