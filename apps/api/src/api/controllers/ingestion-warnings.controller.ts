import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { IngestionWarningsService } from '../../ingestion-warnings/ingestion-warnings.service';
import { IngestionWarningsQueryDto, IngestionWarningDto } from '../dto/ingestion-warnings.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/analytics')
@UseGuards(ProjectMemberGuard)
export class IngestionWarningsController {
  constructor(private readonly ingestionWarningsService: IngestionWarningsService) {}

  @Get('ingestion-warnings')
  async getIngestionWarnings(
    @Query() query: IngestionWarningsQueryDto,
  ): Promise<IngestionWarningDto[]> {
    return this.ingestionWarningsService.getWarnings(query.project_id, query.limit ?? 50) as any;
  }
}
