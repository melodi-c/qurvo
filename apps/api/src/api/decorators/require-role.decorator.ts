import { SetMetadata } from '@nestjs/common';

export type ProjectRole = 'owner' | 'editor';
export const REQUIRED_ROLE_KEY = 'requiredRole';
export const RequireRole = (role: ProjectRole) => SetMetadata(REQUIRED_ROLE_KEY, role);
