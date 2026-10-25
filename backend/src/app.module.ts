import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { DatabaseService } from './database/database.service';
import { AuthModule } from './modules/auth/auth.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { AcademicModule } from './modules/academic/academic.module';
import { QuestionBanksModule } from './modules/question-banks/question-banks.module';
import { ExamsModule } from './modules/exams/exams.module';
import { GradingModule } from './modules/grading/grading.module';
import { ExamEngineModule } from './modules/exam-engine/exam-engine.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { runDevelopmentSeed } from './database/seed';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ObservabilityModule,
    AcademicModule,
    QuestionBanksModule,
    ExamsModule,
    GradingModule,
    ExamEngineModule,
    MonitoringModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.db.runMigrations();
    if (process.env.AUTO_SEED !== 'false') {
      await runDevelopmentSeed(this.db);
    }
  }
}
