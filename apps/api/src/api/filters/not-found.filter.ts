import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ProjectNotFoundException } from '../../projects/exceptions/project-not-found.exception';
import { ApiKeyNotFoundException } from '../../api-keys/exceptions/api-key-not-found.exception';
import { DashboardNotFoundException } from '../../dashboards/exceptions/dashboard-not-found.exception';
import { WidgetNotFoundException } from '../../dashboards/exceptions/widget-not-found.exception';
import { PersonNotFoundException } from '../../persons/exceptions/person-not-found.exception';
import { CohortNotFoundException } from '../../cohorts/exceptions/cohort-not-found.exception';
import { InsightNotFoundException } from '../../insights/exceptions/insight-not-found.exception';
import { InviteNotFoundException } from '../../members/exceptions/invite-not-found.exception';
import { MemberNotFoundException } from '../../members/exceptions/member-not-found.exception';
import { ChannelNotFoundException } from '../../marketing-channels/exceptions/channel-not-found.exception';
import { SpendNotFoundException } from '../../ad-spend/exceptions/spend-not-found.exception';
import { EventDefinitionNotFoundException } from '../../event-definitions/exceptions/event-definition-not-found.exception';

@Catch(ProjectNotFoundException, ApiKeyNotFoundException, DashboardNotFoundException, WidgetNotFoundException, PersonNotFoundException, CohortNotFoundException, InsightNotFoundException, InviteNotFoundException, MemberNotFoundException, ChannelNotFoundException, SpendNotFoundException, EventDefinitionNotFoundException)
export class NotFoundFilter implements ExceptionFilter {
  catch(
    exception:
      | ProjectNotFoundException
      | ApiKeyNotFoundException
      | DashboardNotFoundException
      | WidgetNotFoundException
      | PersonNotFoundException
      | CohortNotFoundException
      | InsightNotFoundException
      | InviteNotFoundException
      | MemberNotFoundException
      | ChannelNotFoundException
      | SpendNotFoundException
      | EventDefinitionNotFoundException,
    host: ArgumentsHost,
  ) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    response.status(HttpStatus.NOT_FOUND).send({
      statusCode: HttpStatus.NOT_FOUND,
      message: exception.message,
    });
  }
}
