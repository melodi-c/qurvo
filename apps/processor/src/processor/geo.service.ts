import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { open, Reader, CountryResponse } from 'maxmind';
import { createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const DEFAULT_MMDB_URL =
  'https://cf92270d-b971-4f1a-9fc8-1cde9031d973.selstorage.ru/data/GeoLite2-Country.mmdb';
const MMDB_PATH = '/tmp/GeoLite2-Country.mmdb';

const LOOPBACK = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1']);
const DOWNLOAD_MAX_ATTEMPTS = 3;
const DOWNLOAD_TIMEOUT_MS = 10_000;
const DOWNLOAD_RETRY_DELAY_MS = 2_000;

@Injectable()
export class GeoService implements OnModuleInit {
  private reader: Reader<CountryResponse> | null = null;

  constructor(
    @InjectPinoLogger(GeoService.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit() {
    try {
      if (existsSync(MMDB_PATH)) {
        this.reader = await open<CountryResponse>(MMDB_PATH);
        this.logger.info('GeoLite2-Country reader initialized from cached file');
        return;
      }

      const url = process.env.GEOLITE2_COUNTRY_URL || DEFAULT_MMDB_URL;
      await this.downloadWithRetry(url);
      this.reader = await open<CountryResponse>(MMDB_PATH);
      this.logger.info('GeoLite2-Country reader initialized');
    } catch (err) {
      this.logger.warn({ err }, 'Failed to load GeoLite2-Country MMDB — geo lookup disabled');
    }
  }

  private async downloadWithRetry(url: string): Promise<void> {
    for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt++) {
      try {
        this.logger.info({ url, attempt }, 'Downloading GeoLite2-Country MMDB');
        const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        await pipeline(
          Readable.fromWeb(res.body as any),
          createWriteStream(MMDB_PATH),
        );
        return;
      } catch (err) {
        if (attempt >= DOWNLOAD_MAX_ATTEMPTS) throw err;
        this.logger.warn({ err, attempt }, 'MMDB download failed, retrying');
        await new Promise((r) => setTimeout(r, DOWNLOAD_RETRY_DELAY_MS * attempt));
      }
    }
  }

  lookupCountry(ip: string): string {
    if (!ip || LOOPBACK.has(ip) || !this.reader) {
      return '';
    }
    try {
      const result = this.reader.get(ip);
      return result?.country?.iso_code ?? '';
    } catch {
      return '';
    }
  }
}
