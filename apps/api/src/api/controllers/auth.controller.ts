import { Controller, Post, Get, Body, Ip, Headers, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../auth/auth.service';
import { VERIFICATION_RESEND_COOLDOWN_SECONDS } from '../../constants';
import { VerificationService } from '../../verification/verification.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  RegisterDto, LoginDto, AuthResponseDto, MeResponseDto,
  OkResponseDto, VerifyEmailByCodeDto, VerifyEmailByTokenDto, ResendVerificationResponseDto,
} from '../dto/auth.dto';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly verificationService: VerificationService,
  ) {}

  @Post('register')
  @Throttle({ short: { limit: 5, ttl: 60000 }, medium: { limit: 5, ttl: 60000 } })
  async register(@Body() body: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(body) as any;
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: 60000 }, medium: { limit: 10, ttl: 60000 } })
  async login(@Body() body: LoginDto, @Ip() ip: string, @Headers('user-agent') userAgent: string): Promise<AuthResponseDto> {
    return this.authService.login(body, { ip, userAgent }) as any;
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(SessionAuthGuard)
  @HttpCode(200)
  async logout(@Headers('authorization') auth: string): Promise<OkResponseDto> {
    const token = auth?.slice(7);
    await this.authService.logout(token);
    return { ok: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(SessionAuthGuard)
  async me(@CurrentUser() user: RequestUser): Promise<MeResponseDto> {
    return { user } as any;
  }

  @Post('verify-email/code')
  @ApiBearerAuth()
  @UseGuards(SessionAuthGuard)
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: 60000 }, medium: { limit: 20, ttl: 60000 } })
  async verifyByCode(@Body() body: VerifyEmailByCodeDto, @CurrentUser() user: RequestUser): Promise<OkResponseDto> {
    await this.verificationService.verifyByCode(user.user_id, body.code);
    return { ok: true };
  }

  @Post('verify-email/token')
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: 60000 }, medium: { limit: 20, ttl: 60000 } })
  async verifyByToken(@Body() body: VerifyEmailByTokenDto): Promise<OkResponseDto> {
    await this.verificationService.verifyByToken(body.token);
    return { ok: true };
  }

  @Post('resend-verification')
  @ApiBearerAuth()
  @UseGuards(SessionAuthGuard)
  @HttpCode(200)
  @Throttle({ short: { limit: 3, ttl: 60000 }, medium: { limit: 5, ttl: 60000 } })
  async resendVerification(@CurrentUser() user: RequestUser): Promise<ResendVerificationResponseDto> {
    await this.verificationService.sendVerificationCode(user.user_id, user.email);
    return { cooldown_seconds: VERIFICATION_RESEND_COOLDOWN_SECONDS };
  }
}
