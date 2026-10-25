import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GradingService } from './grading.service';
import { Roles } from '../../common/roles.decorator';
import { AuthenticatedRequest } from '../../common/auth.guard';

@ApiTags('Grading, Analytics & Reports')
@Controller()
export class GradingController {
  constructor(@Inject(GradingService) private readonly gradingService: GradingService) {}

  @Roles('ADMIN', 'TEACHER')
  @Post('grading/participants/:participantId/essay')
  async gradeEssay(
    @Req() req: AuthenticatedRequest,
    @Param('participantId') participantId: string,
    @Body() body: { questionId: string; scoreAwarded: number; feedback?: string },
  ) {
    return this.gradingService.gradeEssayManually(req.user, participantId, body);
  }

  @Roles('ADMIN', 'TEACHER')
  @Get('reports/exams/:examId/analytics')
  async getAnalytics(@Req() req: AuthenticatedRequest, @Param('examId') examId: string) {
    return this.gradingService.getExamAnalyticsAndItemAnalysis(req.user, examId);
  }

  @Roles('ADMIN', 'TEACHER')
  @Get('reports/exams/:examId/export/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@Req() req: AuthenticatedRequest, @Param('examId') examId: string) {
    const csv = await this.gradingService.exportExamResultsCsv(req.user, examId);
    return {
      format: 'CSV',
      examId,
      generatedAt: new Date().toISOString(),
      content: csv,
    };
  }
}
