import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AcademicService } from './academic.service';
import { Roles } from '../../common/roles.decorator';
import { AuthenticatedRequest } from '../../common/auth.guard';

@ApiTags('Academic, Users & School Settings')
@Controller()
export class AcademicController {
  constructor(@Inject(AcademicService) private readonly academicService: AcademicService) {}

  @Roles('ADMIN')
  @Get('users')
  async listUsers(@Req() req: AuthenticatedRequest, @Query('role') role?: string) {
    return this.academicService.listUsers(req.user, role);
  }

  @Roles('ADMIN')
  @Post('users')
  async createUser(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.academicService.createUser(req.user, body);
  }

  @Roles('ADMIN')
  @Patch('users/:userId')
  async updateUser(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: any,
  ) {
    return this.academicService.updateUserStatus(req.user, userId, body);
  }

  @Roles('ADMIN', 'TEACHER', 'PROCTOR')
  @Get('academic/years')
  async listYears(@Req() req: AuthenticatedRequest) {
    return this.academicService.listAcademicYears(req.user);
  }

  @Roles('ADMIN')
  @Post('academic/years')
  async createYear(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.academicService.createAcademicYear(req.user, body);
  }

  @Roles('ADMIN', 'TEACHER', 'PROCTOR', 'SUPERVISOR')
  @Get('academic/classes')
  async listClasses(@Req() req: AuthenticatedRequest) {
    return this.academicService.listClasses(req.user);
  }

  @Roles('ADMIN')
  @Post('academic/classes')
  async createClass(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.academicService.createClass(req.user, body);
  }

  @Roles('ADMIN')
  @Post('academic/classes/:classId/members')
  async addClassMember(
    @Req() req: AuthenticatedRequest,
    @Param('classId') classId: string,
    @Body() body: { userId: string; membershipRole: 'STUDENT' | 'TEACHER' },
  ) {
    return this.academicService.addClassMember(req.user, classId, body);
  }

  @Roles('ADMIN', 'TEACHER')
  @Get('academic/classes/:classId/members')
  async getClassMembers(@Req() req: AuthenticatedRequest, @Param('classId') classId: string) {
    return this.academicService.getClassMembers(req.user, classId);
  }

  @Roles('ADMIN', 'TEACHER', 'PROCTOR', 'SUPERVISOR', 'STUDENT')
  @Get('academic/subjects')
  async listSubjects(@Req() req: AuthenticatedRequest) {
    return this.academicService.listSubjects(req.user);
  }

  @Roles('ADMIN')
  @Post('academic/subjects')
  async createSubject(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.academicService.createSubject(req.user, body);
  }

  @Roles('ADMIN', 'TEACHER', 'PROCTOR', 'SUPERVISOR')
  @Get('academic/rooms')
  async listRooms(@Req() req: AuthenticatedRequest) {
    return this.academicService.listRooms(req.user);
  }

  @Roles('ADMIN')
  @Post('academic/rooms')
  async createRoom(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.academicService.createRoom(req.user, body);
  }

  @Roles('ADMIN', 'PROCTOR')
  @Get('settings')
  async getSettings(@Req() req: AuthenticatedRequest) {
    return this.academicService.getSystemSettings(req.user);
  }

  @Roles('ADMIN')
  @Patch('settings/:key')
  async updateSetting(
    @Req() req: AuthenticatedRequest,
    @Param('key') key: string,
    @Body() body: Record<string, any>,
  ) {
    return this.academicService.updateSystemSetting(req.user, key, body);
  }

  @Get('notifications')
  async listNotifications(@Req() req: AuthenticatedRequest) {
    return this.academicService.listNotifications(req.user);
  }

  @Roles('ADMIN', 'PROCTOR')
  @Post('notifications')
  async createNotification(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.academicService.createNotification(req.user, body);
  }
}
