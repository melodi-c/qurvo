import { Controller, Post, Get, Patch, Body, Ip, Headers, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../auth/auth.service';
import { VERIFICATION_RESEND_COOLDOWN_SECONDS } from '../../constants';
import { VerificationService } from '../../verification/verification.service';
import { Public } from '../decorators/public.decorator';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import {
  RegisterDto, LoginDto, AuthResponseDto, MeResponseDto,
  VerifyEmailByCodeDto, VerifyEmailByTokenDto, ResendVerificationResponseDto,
  UpdateProfileDto, ChangePasswordDto, ProfileResponseDto,
} from '../dto/auth.dto';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly verificationService: VerificationService,
  ) {}

  @Post('register')
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 }, medium: { limit: 5, ttl: 60000 } })
  async register(@Body() body: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(body) as any;
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: 60000 }, medium: { limit: 10, ttl: 60000 } })
  async login(@Body() body: LoginDto, @Ip() ip: string, @Headers('user-agent') userAgent: string): Promise<AuthResponseDto> {
    return this.authService.login(body, { ip, userAgent }) as any;
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(200)
  async logout(@Headers('authorization') auth: string): Promise<void> {
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token) return;
    await this.authService.logout(token);
  }

  @Get('me')
  @ApiBearerAuth()
  async me(@CurrentUser() user: RequestUser): Promise<MeResponseDto> {
    return { user } as any;
  }

  @Post('verify-email/code')
  @ApiBearerAuth()
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: 60000 }, medium: { limit: 20, ttl: 60000 } })
  async verifyByCode(@Body() body: VerifyEmailByCodeDto, @CurrentUser() user: RequestUser): Promise<void> {
    await this.verificationService.verifyByCode(user.user_id, body.code);
  }

  @Post('verify-email/token')
  @Public()
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: 60000 }, medium: { limit: 20, ttl: 60000 } })
  async verifyByToken(@Body() body: VerifyEmailByTokenDto): Promise<void> {
    await this.verificationService.verifyByToken(body.token);
  }

  @Post('resend-verification')
  @ApiBearerAuth()
  @HttpCode(200)
  @Throttle({ short: { limit: 3, ttl: 60000 }, medium: { limit: 5, ttl: 60000 } })
  async resendVerification(@CurrentUser() user: RequestUser): Promise<ResendVerificationResponseDto> {
    await this.verificationService.sendVerificationCode(user.user_id, user.email);
    return { cooldown_seconds: VERIFICATION_RESEND_COOLDOWN_SECONDS };
  }

  @Patch('profile')
  @ApiBearerAuth()
  async updateProfile(@Body() body: UpdateProfileDto, @CurrentUser() user: RequestUser): Promise<ProfileResponseDto> {
    return this.authService.updateProfile(user.user_id, body) as any;
  }

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(200)
  @Throttle({ short: { limit: 5, ttl: 60000 }, medium: { limit: 5, ttl: 60000 } })
  async changePassword(@Body() body: ChangePasswordDto, @CurrentUser() user: RequestUser): Promise<void> {
    await this.authService.changePassword(user.user_id, body.current_password, body.new_password);
  }
}
