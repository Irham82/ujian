import { SetMetadata } from '@nestjs/common';

export type RoleCode = 'ADMIN' | 'TEACHER' | 'PROCTOR' | 'SUPERVISOR' | 'STUDENT';

export const ROLES_KEY = 'cbt_roles';
export const PUBLIC_KEY = 'cbt_public';

export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata(PUBLIC_KEY, true);
