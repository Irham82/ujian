import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';
import { Roles } from '../../common/roles.decorator';
import { AuthenticatedRequest } from '../../common/auth.guard';

@ApiTags('Anti-Cheating, Proctor & Supervisor Monitoring, Audit & Backup')
@Controller()
export class MonitoringController {
  constructor(@Inject(MonitoringService) private readonly monitoringService: MonitoringService) {}

  @Roles('STUDENT', 'PROCTOR', 'ADMIN')
  @Post('security/events')
  async recordSecurityEvent(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.monitoringService.recordStudentSecurityEvent(req.user, body);
  }

  @Roles('ADMIN', 'PROCTOR', 'SUPERVISOR')
  @Get('monitoring/sessions/:sessionId/summary')
  async getSessionSummary(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ) {
    return this.monitoringService.getSessionSummary(req.user, sessionId);
  }

  @Roles('ADMIN', 'PROCTOR', 'SUPERVISOR')
  @Get('monitoring/sessions/:sessionId/participants')
  async listParticipants(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Query('status') status?: string,
    @Query('classId') classId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.monitoringService.listSessionParticipants(req.user, sessionId, {
      status,
      classId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Roles('ADMIN', 'PROCTOR', 'SUPERVISOR')
  @Get('monitoring/sessions/:sessionId/events')
  async listEvents(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Query('sinceUtc') sinceUtc?: string,
    @Query('classification') classification?: string,
    @Query('limit') limit?: string,
  ) {
    return this.monitoringService.listSessionSecurityEvents(req.user, sessionId, {
      sinceUtc,
      classification,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Roles('ADMIN', 'PROCTOR', 'SUPERVISOR')
  @Post('monitoring/participants/:participantId/attendance')
  async recordAttendance(
    @Req() req: AuthenticatedRequest,
    @Param('participantId') participantId: string,
    @Body() body: { status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'; notes?: string },
  ) {
    return this.monitoringService.recordAttendance(req.user, participantId, body);
  }

  @Roles('ADMIN', 'PROCTOR')
  @Post('monitoring/participants/:participantId/warning')
  async sendWarning(
    @Req() req: AuthenticatedRequest,
    @Param('participantId') participantId: string,
    @Body() body: { message: string },
  ) {
    return this.monitoringService.sendProctorWarning(req.user, participantId, body);
  }

  @Roles('ADMIN', 'PROCTOR')
  @Post('monitoring/participants/:participantId/intervene')
  async intervene(
    @Req() req: AuthenticatedRequest,
    @Param('participantId') participantId: string,
    @Body() body: any,
  ) {
    return this.monitoringService.performProctorIntervention(req.user, participantId, body);
  }

  @Roles('ADMIN', 'PROCTOR', 'SUPERVISOR')
  @Post('monitoring/sessions/:sessionId/incidents')
  async createIncident(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: any,
  ) {
    return this.monitoringService.createIncidentReport(req.user, sessionId, body);
  }

  @Roles('ADMIN', 'PROCTOR', 'SUPERVISOR')
  @Get('monitoring/sessions/:sessionId/incidents')
  async listIncidents(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.monitoringService.listIncidentReports(req.user, sessionId);
  }

  @Roles('ADMIN', 'PROCTOR')
  @Get('monitoring/participants/:participantId/camera-audit')
  async inspectCamera(
    @Req() req: AuthenticatedRequest,
    @Param('participantId') participantId: string,
  ) {
    return this.monitoringService.inspectParticipantCameraRecord(req.user, participantId);
  }

  @Roles('ADMIN', 'PROCTOR')
  @Get('audit-logs')
  async listAuditLogs(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.monitoringService.listAuditLogs(req.user, limit ? Number(limit) : 100);
  }

  @Roles('ADMIN')
  @Post('admin/backup')
  async createBackup(@Req() req: AuthenticatedRequest) {
    return this.monitoringService.triggerBackup(req.user);
  }

  @Roles('ADMIN')
  @Post('admin/restore')
  async restoreBackup(
    @Req() req: AuthenticatedRequest,
    @Body() body: { encryptedPayload: string },
  ) {
    return this.monitoringService.triggerRestore(req.user, body.encryptedPayload);
  }
}
