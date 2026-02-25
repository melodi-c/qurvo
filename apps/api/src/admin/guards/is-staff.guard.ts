import { CanActivate, ExecutionContext, Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import { DRIZZLE } from '../../providers/drizzle.provider';
import { AppForbiddenException } from '../../exceptions/app-forbidden.exception';

@Injectable()
export class IsStaffGuard implements CanActivate {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string = request.user?.user_id;

    if (!userId) {
      throw new AppForbiddenException('Staff access required');
    }

    const result = await this.db
      .select({ is_staff: users.is_staff })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (result.length === 0 || !result[0].is_staff) {
      throw new AppForbiddenException('Staff access required');
    }

    return true;
  }
}
