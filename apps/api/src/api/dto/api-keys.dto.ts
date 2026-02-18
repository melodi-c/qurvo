import { IsString, MinLength, MaxLength, IsOptional, IsArray, IsDateString } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  scopes?: string[];

  @IsDateString()
  @IsOptional()
  expires_at?: string;
}

export class ApiKeyDto {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

export class ApiKeyCreatedDto {
  id: string;
  name: string;
  key: string;
  key_prefix: string;
  created_at: Date;
}
