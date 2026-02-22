import { IsEmail, IsString, MinLength, MaxLength, Matches, Length } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  display_name: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class VerifyEmailByCodeDto {
  @Matches(/^\d{6}$/)
  code: string;
}

export class VerifyEmailByTokenDto {
  @IsString()
  @Length(64, 64)
  token: string;
}

export class UserDto {
  id: string;
  email: string;
  display_name: string;
  email_verified: boolean;
}

export class AuthResponseDto {
  token: string;
  user: UserDto;
}

export class SessionUserDto {
  session_id: string;
  user_id: string;
  email: string;
  display_name: string;
  email_verified: boolean;
}

export class MeResponseDto {
  user: SessionUserDto;
}

export class OkResponseDto {
  ok: boolean;
}

export class ResendVerificationResponseDto {
  cooldown_seconds: number;
}

export class UpdateProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  display_name: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  current_password: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  new_password: string;
}

export class ProfileResponseDto {
  user: UserDto;
}
