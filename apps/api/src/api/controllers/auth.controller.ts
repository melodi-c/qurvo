import { Controller, Post, Get, Body, Ip, Headers, UseGuards, HttpCode, Query, Redirect, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../auth/auth.service';
import { VERIFICATION_RESEND_COOLDOWN_SECONDS } from '../../constants';
import { VerificationService } from '../../verification/verification.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  RegisterDto, LoginDto, AuthResponseDto, MeResponseDto,
  OkResponseDto, VerifyEmailDto, ResendVerificationResponseDto,
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

  @Post('verify-email')
  @ApiBearerAuth()
  @UseGuards(SessionAuthGuard)
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: 60000 }, medium: { limit: 20, ttl: 60000 } })
  async verifyEmail(@Body() body: VerifyEmailDto, @CurrentUser() user: RequestUser): Promise<OkResponseDto> {
    if (body.code) {
      await this.verificationService.verifyByCode(user.user_id, body.code);
    } else if (body.token) {
      await this.verificationService.verifyByToken(body.token);
    } else {
      throw new BadRequestException('Either code or token is required');
    }
    return { ok: true };
  }

  @Get('verify-email')
  @Redirect()
  @Throttle({ short: { limit: 20, ttl: 60000 }, medium: { limit: 50, ttl: 60000 } })
  async verifyEmailByLink(@Query('token') token: string) {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';
    try {
      await this.verificationService.verifyByToken(token);
      return { url: `${baseUrl}/verify-email?verified=true`, statusCode: 302 };
    } catch {
      return { url: `${baseUrl}/verify-email?error=invalid`, statusCode: 302 };
    }
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
