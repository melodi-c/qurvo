import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

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

export class UserDto {
  id: string;
  email: string;
  display_name: string;
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
}

export class MeResponseDto {
  user: SessionUserDto;
}

export class OkResponseDto {
  ok: boolean;
}
