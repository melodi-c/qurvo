import { Controller, Post, Get, Body, Ip, Headers, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../auth/auth.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { RegisterDto, LoginDto, AuthResponseDto, MeResponseDto, OkResponseDto } from '../dto/auth.dto';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ short: { limit: 5, ttl: 60000 }, medium: { limit: 5, ttl: 60000 } })
  async register(@Body() body: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: 60000 }, medium: { limit: 10, ttl: 60000 } })
  async login(@Body() body: LoginDto, @Ip() ip: string, @Headers('user-agent') userAgent: string): Promise<AuthResponseDto> {
    return this.authService.login(body, { ip, userAgent });
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
    return { user };
  }
}
