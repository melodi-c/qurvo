import { IsOptional, IsString } from 'class-validator';

export class ResetDemoDto {
  @IsOptional()
  @IsString()
  scenario?: string;
}

export class ResetDemoResponseDto {
  seeded_events: number;
  scenario: string;
}
