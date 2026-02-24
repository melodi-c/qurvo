import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MarketingChannelsService } from '../../marketing-channels/marketing-channels.service';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  CreateMarketingChannelDto,
  UpdateMarketingChannelDto,
  MarketingChannelDto,
} from '../dto/marketing-channels.dto';

@ApiTags('Marketing Channels')
@ApiBearerAuth()
@Controller('api/projects/:projectId/channels')
export class MarketingChannelsController {
  constructor(private readonly channelsService: MarketingChannelsService) {}

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
  ): Promise<MarketingChannelDto[]> {
    return this.channelsService.list(user.user_id, projectId) as any;
  }

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateMarketingChannelDto,
  ): Promise<MarketingChannelDto> {
    return this.channelsService.create(user.user_id, projectId, body) as any;
  }

  @Put(':channelId')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('channelId') channelId: string,
    @Body() body: UpdateMarketingChannelDto,
  ): Promise<MarketingChannelDto> {
    return this.channelsService.update(user.user_id, projectId, channelId, body) as any;
  }

  @Delete(':channelId')
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Param('channelId') channelId: string,
  ): Promise<void> {
    await this.channelsService.remove(user.user_id, projectId, channelId);
  }
}
