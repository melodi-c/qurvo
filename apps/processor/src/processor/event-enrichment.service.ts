import { Injectable } from '@nestjs/common';
import type { Event } from '@qurvo/clickhouse';
import { PersonResolverService } from './person-resolver.service';
import { PersonBatchStore } from './person-batch-store';
import { GeoService } from './geo.service';

@Injectable()
export class EventEnrichmentService {
  constructor(
    private readonly personResolver: PersonResolverService,
    private readonly personBatchStore: PersonBatchStore,
    private readonly geoService: GeoService,
  ) {}

  async buildEvent(data: Record<string, string>): Promise<Event> {
    const ip = data.ip || '';
    const country = this.geoService.lookupCountry(ip);
    const projectId = data.project_id || '';

    let personId: string;
    let mergedFromPersonId: string | null = null;

    if (data.event_name === '$identify' && data.anonymous_id) {
      const result = await this.personResolver.handleIdentify(projectId, data.distinct_id, data.anonymous_id);
      personId = result.personId;
      mergedFromPersonId = result.mergedFromPersonId;
    } else {
      personId = await this.personResolver.resolve(projectId, data.distinct_id);
    }

    this.personBatchStore.enqueue(projectId, personId, data.distinct_id, data.user_properties || '{}');
    if (mergedFromPersonId) {
      this.personBatchStore.enqueueMerge(projectId, mergedFromPersonId, personId);
    }

    return {
      event_id: data.event_id || '',
      project_id: projectId,
      event_name: data.event_name || '',
      event_type: data.event_type || 'track',
      distinct_id: data.distinct_id || '',
      anonymous_id: data.anonymous_id,
      user_id: data.user_id,
      person_id: personId,
      session_id: data.session_id,
      url: data.url,
      referrer: data.referrer,
      page_title: data.page_title,
      page_path: data.page_path,
      device_type: data.device_type,
      browser: data.browser,
      browser_version: data.browser_version,
      os: data.os,
      os_version: data.os_version,
      screen_width: Math.max(0, data.screen_width ? parseInt(data.screen_width) : 0),
      screen_height: Math.max(0, data.screen_height ? parseInt(data.screen_height) : 0),
      country,
      language: data.language,
      timezone: data.timezone,
      properties: data.properties,
      user_properties: data.user_properties,
      sdk_name: data.sdk_name,
      sdk_version: data.sdk_version,
      timestamp: data.timestamp || new Date().toISOString(),
      batch_id: data.batch_id,
      ip,
    };
  }
}
