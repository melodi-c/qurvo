import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../api/decorators/public.decorator';

@Controller('health')
@SkipThrottle()
@Public()
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
