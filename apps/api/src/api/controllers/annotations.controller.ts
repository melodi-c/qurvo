import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AnnotationsService } from '../../annotations/annotations.service';
import { RequireRole } from '../decorators/require-role.decorator';
import { ProjectMemberGuard } from '../guards/project-member.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  CreateAnnotationDto,
  UpdateAnnotationDto,
  AnnotationQueryDto,
  AnnotationDto,
} from '../dto/annotations.dto';

@ApiTags('Annotations')
@ApiBearerAuth()
@Controller('api/projects/:projectId/annotations')
@UseGuards(ProjectMemberGuard)
export class AnnotationsController {
  constructor(private readonly annotationsService: AnnotationsService) {}

  @Get()
  @ApiOkResponse({ type: [AnnotationDto] })
  async list(
    @Param('projectId') projectId: string,
    @Query() query: AnnotationQueryDto,
  ): Promise<AnnotationDto[]> {
    return this.annotationsService.list(projectId, query.date_from, query.date_to) as any;
  }

  @Post()
  @RequireRole('editor')
  @ApiOkResponse({ type: AnnotationDto })
  async create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
    @Body() body: CreateAnnotationDto,
  ): Promise<AnnotationDto> {
    return this.annotationsService.create(projectId, user.user_id, body) as any;
  }

  @Put(':id')
  @RequireRole('editor')
  @ApiOkResponse({ type: AnnotationDto })
  async update(
    @Param('projectId') projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAnnotationDto,
  ): Promise<AnnotationDto> {
    return this.annotationsService.update(projectId, id, body) as any;
  }

  @Delete(':id')
  @RequireRole('editor')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('projectId') projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.annotationsService.remove(projectId, id);
  }
}
