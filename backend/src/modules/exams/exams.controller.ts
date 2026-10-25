import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExamLifecycleStatus, ExamsService } from './exams.service';
import { Roles } from '../../common/roles.decorator';
import { AuthenticatedRequest } from '../../common/auth.guard';

@ApiTags('Exams & Exam Sessions')
@Controller()
export class ExamsController {
  constructor(@Inject(ExamsService) private readonly examsService: ExamsService) {}

  @Roles('ADMIN', 'TEACHER', 'PROCTOR')
  @Get('exams')
  async listExams(@Req() req: AuthenticatedRequest) {
    return this.examsService.listExams(req.user);
  }

  @Roles('ADMIN', 'TEACHER')
  @Post('exams')
  async createExam(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.examsService.createExam(req.user, body);
  }

  @Roles('ADMIN', 'TEACHER')
  @Post('exams/:examId/status')
  async transitionStatus(
    @Req() req: AuthenticatedRequest,
    @Param('examId') examId: string,
    @Body() body: { status: ExamLifecycleStatus },
  ) {
    return this.examsService.transitionExamStatus(req.user, examId, body.status);
  }

  @Roles('ADMIN')
  @Patch('exams/:examId/security-policy')
  async updateSecurityPolicy(
    @Req() req: AuthenticatedRequest,
    @Param('examId') examId: string,
    @Body() body: any,
  ) {
    return this.examsService.updateExamSecurityAndCameraPolicy(req.user, examId, body);
  }

  @Roles('ADMIN', 'TEACHER', 'PROCTOR', 'SUPERVISOR')
  @Get('exam-sessions')
  async listSessions(@Req() req: AuthenticatedRequest) {
    return this.examsService.listSessions(req.user);
  }

  @Roles('ADMIN')
  @Post('exam-sessions')
  async createSession(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.examsService.createSession(req.user, body);
  }
}
