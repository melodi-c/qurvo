import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ── Stats ─────────────────────────────────────────────────────────────────────

export class AdminStatsDto {
  total_users: number;
  total_projects: number;
  total_events: number;
  redis_stream_depth: number;
}

// ── Users ─────────────────────────────────────────────────────────────────────

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

export class AdminUserProjectDto {
  id: string;
  name: string;
  @ApiProperty({ enum: ['owner', 'editor', 'viewer'] })
  role: 'owner' | 'editor' | 'viewer';
}

export class AdminUserListItemDto {
  id: string;
  email: string;
  display_name: string;
  is_staff: boolean;
  email_verified: boolean;
  created_at: Date;
  project_count: number;
}

export class AdminUserDetailDto {
  id: string;
  email: string;
  display_name: string;
  is_staff: boolean;
  email_verified: boolean;
  created_at: Date;
  @ApiProperty({ type: [AdminUserProjectDto] })
  projects: AdminUserProjectDto[];
}

// ── Projects ──────────────────────────────────────────────────────────────────

export class PatchAdminProjectDto {
  @IsOptional()
  @IsUUID()
  plan_id?: string | null;
}

export class AdminProjectMemberDto {
  id: string;
  email: string;
  display_name: string;
  @ApiProperty({ enum: ['owner', 'editor', 'viewer'] })
  role: 'owner' | 'editor' | 'viewer';
}

export class AdminProjectListItemDto {
  id: string;
  name: string;
  slug: string;
  plan_id: string | null;
  plan_name: string | null;
  member_count: number;
  created_at: Date;
}

export class AdminProjectDetailDto {
  id: string;
  name: string;
  slug: string;
  token: string;
  plan_id: string | null;
  plan_name: string | null;
  created_at: Date;
  @ApiProperty({ type: [AdminProjectMemberDto] })
  members: AdminProjectMemberDto[];
}
