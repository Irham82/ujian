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
import { QuestionBanksService } from './question-banks.service';
import { Roles } from '../../common/roles.decorator';
import { AuthenticatedRequest } from '../../common/auth.guard';

@ApiTags('Question Banks & Questions')
@Roles('ADMIN', 'TEACHER')
@Controller('question-banks')
export class QuestionBanksController {
  constructor(
    @Inject(QuestionBanksService) private readonly questionBanksService: QuestionBanksService,
  ) {}

  @Get()
  async listBanks(@Req() req: AuthenticatedRequest) {
    return this.questionBanksService.listBanks(req.user);
  }

  @Post()
  async createBank(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.questionBanksService.createBank(req.user, body);
  }

  @Get(':bankId/questions')
  async listQuestions(@Req() req: AuthenticatedRequest, @Param('bankId') bankId: string) {
    return this.questionBanksService.listQuestions(req.user, bankId);
  }

  @Post(':bankId/questions')
  async createQuestion(
    @Req() req: AuthenticatedRequest,
    @Param('bankId') bankId: string,
    @Body() body: any,
  ) {
    return this.questionBanksService.createQuestion(req.user, bankId, body);
  }

  @Patch(':bankId/questions/:questionId')
  async updateQuestion(
    @Req() req: AuthenticatedRequest,
    @Param('bankId') bankId: string,
    @Param('questionId') questionId: string,
    @Body() body: any,
  ) {
    return this.questionBanksService.updateQuestion(req.user, bankId, questionId, body);
  }

  @Get(':bankId/export')
  async exportBank(@Req() req: AuthenticatedRequest, @Param('bankId') bankId: string) {
    return this.questionBanksService.exportBank(req.user, bankId);
  }

  @Post(':bankId/import')
  async importQuestions(
    @Req() req: AuthenticatedRequest,
    @Param('bankId') bankId: string,
    @Body() body: { questions: any[] },
  ) {
    return this.questionBanksService.importBankQuestions(req.user, bankId, body.questions || []);
  }
}
