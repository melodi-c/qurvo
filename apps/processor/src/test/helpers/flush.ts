import type { INestApplicationContext } from '@nestjs/common';
import { FlushService } from '../../processor/flush.service';

/**
 * Triggers flush of all buffered events to ClickHouse.
 * Call in beforeEach to ensure clean state between tests.
 */
export async function flushBuffer(app: INestApplicationContext): Promise<void> {
  const flushService = app.get(FlushService);
  await flushService.flush();
}
