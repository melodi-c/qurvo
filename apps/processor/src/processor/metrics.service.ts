import * as http from 'http';
import { Injectable, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

const METRICS_PORT = 9090;

@Injectable()
export class MetricsService implements OnModuleInit, OnApplicationShutdown {
  private readonly registry = new Registry();
  private server: http.Server | null = null;

  readonly eventsProcessed = new Counter({
    name: 'processor_events_processed_total',
    help: 'Total number of successfully processed events',
    registers: [this.registry],
  });

  readonly eventsFailed = new Counter({
    name: 'processor_events_failed_total',
    help: 'Total number of failed events',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });

  readonly flushDuration = new Histogram({
    name: 'processor_batch_flush_duration_seconds',
    help: 'Duration of ClickHouse batch insert in seconds',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  readonly bufferSize = new Gauge({
    name: 'processor_buffer_size',
    help: 'Current number of events in the flush buffer',
    registers: [this.registry],
  });

  readonly personBatchQueueSize = new Gauge({
    name: 'processor_person_batch_queue_size',
    help: 'Number of pending persons in PersonBatchStore',
    registers: [this.registry],
  });

  readonly dlqSize = new Gauge({
    name: 'processor_dlq_size',
    help: 'Number of messages in the DLQ stream (XLEN events:dlq)',
    registers: [this.registry],
  });

  readonly consecutiveErrors = new Gauge({
    name: 'processor_consecutive_errors',
    help: 'Number of consecutive errors in the consumer loop',
    registers: [this.registry],
  });

  readonly pelSize = new Gauge({
    name: 'processor_pel_size',
    help: 'Number of pending (unacknowledged) messages in the consumer group PEL',
    registers: [this.registry],
  });

  onModuleInit() {
    this.server = http.createServer(async (req, res) => {
      if (req.url === '/metrics') {
        try {
          const metrics = await this.registry.metrics();
          res.setHeader('Content-Type', this.registry.contentType);
          res.end(metrics);
        } catch {
          res.writeHead(500);
          res.end();
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    this.server.listen(METRICS_PORT);
  }

  onApplicationShutdown() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
