import { IsBoolean } from 'class-validator';

export class AdminStatsDto {
  total_users: number;
  total_projects: number;
  total_events: number;
  redis_stream_depth: number;
}

export class PatchUserStaffDto {
  @IsBoolean()
  is_staff: boolean;
}

export class AdminUserDto {
  id: string;
  email: string;
  display_name: string;
  is_staff: boolean;
}
