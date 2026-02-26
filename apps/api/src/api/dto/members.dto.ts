import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProjectRole } from '../../constants';

// ── Input DTOs ────────────────────────────────────────────────────────────────

export class CreateInviteDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ enum: ['editor', 'viewer'] })
  @IsIn(['editor', 'viewer'])
  role: 'editor' | 'viewer';
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ['editor', 'viewer'] })
  @IsIn(['editor', 'viewer'])
  role: 'editor' | 'viewer';
}

// ── Response DTOs ─────────────────────────────────────────────────────────────

export class MemberUserDto {
  id: string;
  email: string;
  display_name: string;
}

export class MemberDto {
  id: string;
  project_id: string;
  user: MemberUserDto;
  @ApiProperty({ enum: ['owner', 'editor', 'viewer'] })
  role: ProjectRole;
  created_at: Date;
}

export class InviterDto {
  id: string;
  email: string;
  display_name: string;
}

export class InviteDto {
  id: string;
  project_id: string;
  invited_by: InviterDto;
  email: string;
  @ApiProperty({ enum: ['owner', 'editor', 'viewer'] })
  role: ProjectRole;
  @ApiProperty({ enum: ['pending', 'accepted', 'declined', 'cancelled'] })
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: Date;
  responded_at: Date | null;
}

export class ProjectSummaryDto {
  id: string;
  name: string;
  slug: string;
}

export class MyInviteDto {
  id: string;
  project: ProjectSummaryDto;
  invited_by: InviterDto;
  @ApiProperty({ enum: ['owner', 'editor', 'viewer'] })
  role: ProjectRole;
  @ApiProperty({ enum: ['pending', 'accepted', 'declined', 'cancelled'] })
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: Date;
}
