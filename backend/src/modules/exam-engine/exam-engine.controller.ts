import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExamEngineService } from './exam-engine.service';
import { Roles } from '../../common/roles.decorator';
import { AuthenticatedRequest } from '../../common/auth.guard';

@ApiTags('Student Exam Engine, Autosave & Offline Sync')
@Roles('STUDENT')
@Controller('student')
export class ExamEngineController {
  constructor(@Inject(ExamEngineService) private readonly examEngineService: ExamEngineService) {}

  @Get('exams')
  async listStudentExams(@Req() req: AuthenticatedRequest) {
    return this.examEngineService.listStudentExams(req.user);
  }

  @Post('exams/:sessionId/device-check')
  async checkDevice(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: any,
  ) {
    const sebConfigHeader = req.headers['x-safeexambrowser-configkeyhash'];
    const sebReqHeader = req.headers['x-safeexambrowser-requesthash'];
    return this.examEngineService.checkDeviceCompatibility(req.user, sessionId, {
      ...body,
      userAgent: body?.userAgent || String(req.headers['user-agent'] || ''),
      sebConfigKeyHash:
        body?.sebConfigKeyHash || (Array.isArray(sebConfigHeader) ? sebConfigHeader[0] : sebConfigHeader),
      sebRequestHash:
        body?.sebRequestHash || (Array.isArray(sebReqHeader) ? sebReqHeader[0] : sebReqHeader),
    });
  }

  @Post('exams/:sessionId/start')
  async startExam(@Req() req: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    const sebConfigHeader = req.headers['x-safeexambrowser-configkeyhash'];
    const sebReqHeader = req.headers['x-safeexambrowser-requesthash'];
    return this.examEngineService.startOrResumeExam(req.user, sessionId, {
      userAgent: String(req.headers['user-agent'] || ''),
      sebConfigKeyHash: Array.isArray(sebConfigHeader) ? sebConfigHeader[0] : sebConfigHeader,
      sebRequestHash: Array.isArray(sebReqHeader) ? sebReqHeader[0] : sebReqHeader,
    });
  }

  @Get('participants/:participantId/paper')
  async getPaper(
    @Req() req: AuthenticatedRequest,
    @Param('participantId') participantId: string,
  ) {
    return this.examEngineService.getParticipantPaper(req.user, participantId);
  }

  @Put('participants/:participantId/answers')
  async saveAnswer(
    @Req() req: AuthenticatedRequest,
    @Param('participantId') participantId: string,
    @Body() body: any,
  ) {
    return this.examEngineService.saveAnswer(req.user, participantId, body);
  }

  @Post('participants/:participantId/offline-sync')
  async syncOffline(
    @Req() req: AuthenticatedRequest,
    @Param('participantId') participantId: string,
    @Body() body: any,
  ) {
    return this.examEngineService.syncOfflineBatch(req.user, participantId, body);
  }

  @Post('participants/:participantId/heartbeat')
  async heartbeat(
    @Req() req: AuthenticatedRequest,
    @Param('participantId') participantId: string,
    @Body() body: any,
  ) {
    return this.examEngineService.recordHeartbeat(req.user, participantId, body);
  }

  @Post('participants/:participantId/submit')
  async submitExam(
    @Req() req: AuthenticatedRequest,
    @Param('participantId') participantId: string,
    @Body() body: { idempotencyKey?: string },
  ) {
    return this.examEngineService.submitExam(req.user, participantId, body || {});
  }
}
