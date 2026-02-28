import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { open, Reader, CountryResponse } from 'maxmind';
import { createWriteStream, existsSync, statSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import {
  GEO_DOWNLOAD_MAX_ATTEMPTS,
  GEO_DOWNLOAD_TIMEOUT_MS,
  GEO_DOWNLOAD_RETRY_DELAY_MS,
  MMDB_MAX_AGE_MS,
} from '../constants';
import { ONE_DAY_MS } from './time-utils';

const DEFAULT_MMDB_URL =
  'https://cf92270d-b971-4f1a-9fc8-1cde9031d973.selstorage.ru/data/GeoLite2-Country.mmdb';
const MMDB_PATH = '/tmp/GeoLite2-Country.mmdb';

const LOOPBACK = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1']);

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
        const stats = statSync(MMDB_PATH);
        const ageMs = Date.now() - stats.mtimeMs;
        const ageDays = Math.floor(ageMs / ONE_DAY_MS);

        if (ageMs < MMDB_MAX_AGE_MS) {
          this.reader = await open<CountryResponse>(MMDB_PATH);
          this.logger.info({ ageDays }, 'GeoLite2-Country reader initialized from cached file');
          return;
        }

        this.logger.info({ ageDays }, 'Cached MMDB file is stale, re-downloading');
      }

      const url = process.env.GEOLITE2_COUNTRY_URL || DEFAULT_MMDB_URL;
      await this.downloadWithRetry(url);
      this.reader = await open<CountryResponse>(MMDB_PATH);
      this.logger.info('GeoLite2-Country reader initialized');
    } catch (err) {
      // If download fails but a stale file exists, use it as fallback
      if (existsSync(MMDB_PATH)) {
        try {
          this.reader = await open<CountryResponse>(MMDB_PATH);
          this.logger.warn({ err }, 'Failed to download fresh MMDB — using stale cached file as fallback');
          return;
        } catch { /* fall through to disabled state */ }
      }
      this.logger.warn({ err }, 'Failed to load GeoLite2-Country MMDB — geo lookup disabled');
    }
  }

  private async downloadWithRetry(url: string): Promise<void> {
    for (let attempt = 1; attempt <= GEO_DOWNLOAD_MAX_ATTEMPTS; attempt++) {
      try {
        this.logger.info({ url, attempt }, 'Downloading GeoLite2-Country MMDB');
        const res = await fetch(url, { signal: AbortSignal.timeout(GEO_DOWNLOAD_TIMEOUT_MS) });
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        await pipeline(
          Readable.fromWeb(res.body as unknown as ReadableStream<Uint8Array>),
          createWriteStream(MMDB_PATH),
        );
        return;
      } catch (err) {
        if (attempt >= GEO_DOWNLOAD_MAX_ATTEMPTS) {throw err;}
        this.logger.warn({ err, attempt }, 'MMDB download failed, retrying');
        await new Promise((r) => setTimeout(r, GEO_DOWNLOAD_RETRY_DELAY_MS * attempt));
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
