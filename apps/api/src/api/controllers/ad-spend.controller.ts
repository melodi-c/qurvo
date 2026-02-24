import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdSpendService } from '../../ad-spend/ad-spend.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  CreateAdSpendDto,
  BulkCreateAdSpendDto,
  UpdateAdSpendDto,
  AdSpendDto,
  AdSpendSummaryDto,
  AdSpendListQueryDto,
  AdSpendSummaryQueryDto,
} from '../dto/ad-spend.dto';

@ApiTags('Ad Spend')
@ApiBearerAuth()
@Controller('api/projects/:projectId/ad-spend')
export class AdSpendController {
  constructor(private readonly adSpendService: AdSpendService) {}

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Query() query: AdSpendListQueryDto,
  ): Promise<AdSpendDto[]> {
    return this.adSpendService.list(user.user_id, projectId, query) as any;
  }

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateAdSpendDto,
  ): Promise<AdSpendDto> {
    return this.adSpendService.create(user.user_id, projectId, body) as any;
  }

  @Post('bulk')
  async bulkCreate(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: BulkCreateAdSpendDto,
  ): Promise<AdSpendDto[]> {
    return this.adSpendService.bulkCreate(user.user_id, projectId, body.items) as any;
  }

  @Put(':id')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: UpdateAdSpendDto,
  ): Promise<AdSpendDto> {
    return this.adSpendService.update(user.user_id, projectId, id, body) as any;
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.adSpendService.remove(user.user_id, projectId, id);
  }

  @Get('summary')
  async summary(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Query() query: AdSpendSummaryQueryDto,
  ): Promise<AdSpendSummaryDto[]> {
    return this.adSpendService.summary(user.user_id, projectId, query) as any;
  }
}
