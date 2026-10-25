import { Module } from '@nestjs/common';
import { ExamEngineController } from './exam-engine.controller';
import { ExamEngineService } from './exam-engine.service';
import { GradingModule } from '../grading/grading.module';

@Module({
  imports: [GradingModule],
  controllers: [ExamEngineController],
  providers: [ExamEngineService],
  exports: [ExamEngineService],
})
export class ExamEngineModule {}
