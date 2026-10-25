import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { SessionTokenPayload } from '../../common/crypto.util';
import * as crypto from 'crypto';

export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE_COMPLEX'
  | 'TRUE_FALSE'
  | 'SHORT_ANSWER'
  | 'ESSAY';

@Injectable()
export class QuestionBanksService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async verifyBankAccess(actor: SessionTokenPayload, bankId: string, requireWrite = false) {
    const res = await this.db.query<{
      id: string;
      school_id: string;
      subject_id: string;
      owner_teacher_id: string;
      title: string;
      is_shared: boolean;
    }>(
      `SELECT id, school_id, subject_id, owner_teacher_id, title, is_shared
       FROM question_banks
       WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL`,
      [bankId, actor.schoolId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException('Bank soal tidak ditemukan');
    }
    const bank = res.rows[0];
    if (actor.roles.includes('ADMIN')) {
      return bank;
    }
    const isOwner = bank.owner_teacher_id === actor.sub;
    if (requireWrite && !isOwner) {
      await this.audit.log({
        schoolId: actor.schoolId,
        actorUserId: actor.sub,
        actorRole: actor.roles.join(','),
        action: 'UNAUTHORIZED_QUESTION_BANK_WRITE',
        targetType: 'QUESTION_BANK',
        targetId: bankId,
      });
      throw new ForbiddenException('Anda tidak memiliki kewenangan mengubah bank soal milik guru lain');
    }
    if (!requireWrite && !isOwner && !bank.is_shared) {
      await this.audit.log({
        schoolId: actor.schoolId,
        actorUserId: actor.sub,
        actorRole: actor.roles.join(','),
        action: 'UNAUTHORIZED_QUESTION_BANK_READ',
        targetType: 'QUESTION_BANK',
        targetId: bankId,
      });
      throw new ForbiddenException('Anda tidak memiliki akses ke bank soal ini');
    }
    return bank;
  }

  async listBanks(actor: SessionTokenPayload) {
    if (actor.roles.includes('ADMIN')) {
      const res = await this.db.query(
        `SELECT qb.*, s.name AS subject_name, s.code AS subject_code, u.full_name AS owner_name,
                (SELECT COUNT(*)::int FROM questions q WHERE q.question_bank_id = qb.id AND q.deleted_at IS NULL) AS question_count
         FROM question_banks qb
         JOIN subjects s ON s.id = qb.subject_id
         JOIN users u ON u.id = qb.owner_teacher_id
         WHERE qb.school_id = $1 AND qb.deleted_at IS NULL
         ORDER BY qb.created_at DESC`,
        [actor.schoolId],
      );
      return res.rows;
    }

    const res = await this.db.query(
      `SELECT qb.*, s.name AS subject_name, s.code AS subject_code, u.full_name AS owner_name,
              (SELECT COUNT(*)::int FROM questions q WHERE q.question_bank_id = qb.id AND q.deleted_at IS NULL) AS question_count
       FROM question_banks qb
       JOIN subjects s ON s.id = qb.subject_id
       JOIN users u ON u.id = qb.owner_teacher_id
       WHERE qb.school_id = $1 AND qb.deleted_at IS NULL
         AND (qb.owner_teacher_id = $2 OR qb.is_shared = TRUE)
       ORDER BY qb.created_at DESC`,
      [actor.schoolId, actor.sub],
    );
    return res.rows;
  }

  async createBank(
    actor: SessionTokenPayload,
    dto: { subjectId: string; title: string; description?: string; isShared?: boolean },
  ) {
    if (!dto.subjectId || !dto.title) {
      throw new BadRequestException('subjectId dan title wajib diisi');
    }
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO question_banks (id, school_id, subject_id, owner_teacher_id, title, description, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        actor.schoolId,
        dto.subjectId,
        actor.sub,
        dto.title.trim(),
        dto.description || null,
        Boolean(dto.isShared),
      ],
    );
    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'QUESTION_BANK_CREATED',
      targetType: 'QUESTION_BANK',
      targetId: id,
      metadata: { title: dto.title, subjectId: dto.subjectId },
    });
    return { id, ...dto, ownerTeacherId: actor.sub };
  }

  async listQuestions(actor: SessionTokenPayload, bankId: string) {
    await this.verifyBankAccess(actor, bankId, false);
    const questionsRes = await this.db.query(
      `SELECT * FROM questions
       WHERE question_bank_id = $1 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [bankId],
    );
    const optionsRes = await this.db.query(
      `SELECT qo.* FROM question_options qo
       JOIN questions q ON q.id = qo.question_id
       WHERE q.question_bank_id = $1 AND q.deleted_at IS NULL
       ORDER BY qo.sort_order ASC`,
      [bankId],
    );
    const assetsRes = await this.db.query(
      `SELECT qa.* FROM question_assets qa
       JOIN questions q ON q.id = qa.question_id
       WHERE q.question_bank_id = $1 AND q.deleted_at IS NULL`,
      [bankId],
    );

    const optionsByQ = new Map<string, any[]>();
    for (const opt of optionsRes.rows) {
      const list = optionsByQ.get(opt.question_id) || [];
      list.push(opt);
      optionsByQ.set(opt.question_id, list);
    }

    const assetsByQ = new Map<string, any[]>();
    for (const asset of assetsRes.rows) {
      const list = assetsByQ.get(asset.question_id) || [];
      list.push(asset);
      assetsByQ.set(asset.question_id, list);
    }

    return questionsRes.rows.map((q) => ({
      ...q,
      options: optionsByQ.get(q.id) || [],
      assets: assetsByQ.get(q.id) || [],
    }));
  }

  async createQuestion(
    actor: SessionTokenPayload,
    bankId: string,
    dto: {
      questionType: QuestionType;
      status?: 'DRAFT' | 'REVIEW' | 'PUBLISHED';
      difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
      category?: string;
      tags?: string[];
      stemHtml: string;
      stimulusTableJson?: any;
      formulaLatex?: string;
      defaultWeight?: number;
      answerKey: Record<string, any>;
      explanationHtml?: string;
      options?: Array<{
        optionKey: string;
        contentHtml: string;
        isCorrect: boolean;
        sortOrder?: number;
      }>;
      assets?: Array<{
        assetType: 'IMAGE' | 'TABLE' | 'FORMULA' | 'DOCUMENT';
        fileName: string;
        storageKey: string;
        mimeType: string;
        fileSizeBytes?: number;
        altText?: string;
      }>;
    },
  ) {
    await this.verifyBankAccess(actor, bankId, true);

    if (!dto.questionType || !dto.stemHtml || !dto.answerKey) {
      throw new BadRequestException('questionType, stemHtml, dan answerKey wajib diisi');
    }

    const questionId = crypto.randomUUID();
    await this.db.withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO questions (
          id, question_bank_id, question_type, status, version, difficulty, category, tags,
          stem_html, stimulus_table_json, formula_latex, default_weight, answer_key, explanation_html, created_by
        ) VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          questionId,
          bankId,
          dto.questionType,
          dto.status || 'PUBLISHED',
          dto.difficulty || 'MEDIUM',
          dto.category || 'UMUM',
          JSON.stringify(dto.tags || []),
          dto.stemHtml,
          dto.stimulusTableJson ? JSON.stringify(dto.stimulusTableJson) : null,
          dto.formulaLatex || null,
          dto.defaultWeight ?? 10,
          JSON.stringify(dto.answerKey),
          dto.explanationHtml || null,
          actor.sub,
        ],
      );

      if (dto.options && dto.options.length > 0) {
        for (let i = 0; i < dto.options.length; i++) {
          const opt = dto.options[i];
          await tx.query(
            `INSERT INTO question_options (id, question_id, option_key, content_html, is_correct, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              crypto.randomUUID(),
              questionId,
              opt.optionKey,
              opt.contentHtml,
              Boolean(opt.isCorrect),
              opt.sortOrder ?? i + 1,
            ],
          );
        }
      }

      if (dto.assets && dto.assets.length > 0) {
        for (const asset of dto.assets) {
          await tx.query(
            `INSERT INTO question_assets (id, question_id, asset_type, file_name, storage_key, mime_type, file_size_bytes, alt_text)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              crypto.randomUUID(),
              questionId,
              asset.assetType,
              asset.fileName,
              asset.storageKey,
              asset.mimeType,
              asset.fileSizeBytes || 0,
              asset.altText || null,
            ],
          );
        }
      }
    });

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'QUESTION_CREATED',
      targetType: 'QUESTION',
      targetId: questionId,
      metadata: { bankId, questionType: dto.questionType, status: dto.status || 'PUBLISHED' },
    });

    return { id: questionId, bankId, version: 1, ...dto };
  }

  async updateQuestion(
    actor: SessionTokenPayload,
    bankId: string,
    questionId: string,
    dto: Partial<{
      status: 'DRAFT' | 'REVIEW' | 'PUBLISHED';
      difficulty: 'EASY' | 'MEDIUM' | 'HARD';
      category: string;
      tags: string[];
      stemHtml: string;
      stimulusTableJson: any;
      formulaLatex: string;
      defaultWeight: number;
      answerKey: Record<string, any>;
      explanationHtml: string;
      options: Array<{
        optionKey: string;
        contentHtml: string;
        isCorrect: boolean;
        sortOrder?: number;
      }>;
    }>,
  ) {
    await this.verifyBankAccess(actor, bankId, true);
    const existingRes = await this.db.query(
      `SELECT * FROM questions WHERE id = $1 AND question_bank_id = $2 AND deleted_at IS NULL`,
      [questionId, bankId],
    );
    if (existingRes.rows.length === 0) {
      throw new NotFoundException('Soal tidak ditemukan');
    }
    const existing = existingRes.rows[0];
    const nextVersion = Number(existing.version || 1) + 1;
    const prevHistory = Array.isArray(existing.version_history) ? existing.version_history : [];
    const snapshotEntry = {
      version: existing.version,
      archivedAt: new Date().toISOString(),
      archivedBy: actor.sub,
      stemHtml: existing.stem_html,
      answerKey: existing.answer_key,
      defaultWeight: existing.default_weight,
    };

    await this.db.withTransaction(async (tx) => {
      await tx.query(
        `UPDATE questions
         SET status = COALESCE($3, status),
             difficulty = COALESCE($4, difficulty),
             category = COALESCE($5, category),
             tags = COALESCE($6, tags),
             stem_html = COALESCE($7, stem_html),
             formula_latex = COALESCE($8, formula_latex),
             default_weight = COALESCE($9, default_weight),
             answer_key = COALESCE($10, answer_key),
             explanation_html = COALESCE($11, explanation_html),
             version = $12,
             version_history = $13,
             updated_at = NOW()
         WHERE id = $1 AND question_bank_id = $2`,
        [
          questionId,
          bankId,
          dto.status || null,
          dto.difficulty || null,
          dto.category || null,
          dto.tags ? JSON.stringify(dto.tags) : null,
          dto.stemHtml || null,
          dto.formulaLatex || null,
          dto.defaultWeight ?? null,
          dto.answerKey ? JSON.stringify(dto.answerKey) : null,
          dto.explanationHtml || null,
          nextVersion,
          JSON.stringify([...prevHistory, snapshotEntry]),
        ],
      );

      if (dto.options) {
        await tx.query('DELETE FROM question_options WHERE question_id = $1', [questionId]);
        for (let i = 0; i < dto.options.length; i++) {
          const opt = dto.options[i];
          await tx.query(
            `INSERT INTO question_options (id, question_id, option_key, content_html, is_correct, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              crypto.randomUUID(),
              questionId,
              opt.optionKey,
              opt.contentHtml,
              Boolean(opt.isCorrect),
              opt.sortOrder ?? i + 1,
            ],
          );
        }
      }
    });

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'QUESTION_VERSION_UPDATED',
      targetType: 'QUESTION',
      targetId: questionId,
      metadata: {
        bankId,
        previousVersion: existing.version,
        newVersion: nextVersion,
        answerKeyModified: Boolean(dto.answerKey),
      },
    });

    return { id: questionId, bankId, version: nextVersion };
  }

  async exportBank(actor: SessionTokenPayload, bankId: string) {
    const bank = await this.verifyBankAccess(actor, bankId, false);
    const questions = await this.listQuestions(actor, bankId);
    return {
      exportedAt: new Date().toISOString(),
      bank: {
        id: bank.id,
        title: bank.title,
        subjectId: bank.subject_id,
      },
      questionsCount: questions.length,
      questions,
    };
  }

  async importBankQuestions(
    actor: SessionTokenPayload,
    bankId: string,
    items: Array<any>,
  ) {
    await this.verifyBankAccess(actor, bankId, true);
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Daftar soal impor tidak boleh kosong');
    }
    const createdIds: string[] = [];
    for (const item of items) {
      const created = await this.createQuestion(actor, bankId, item);
      createdIds.push(created.id);
    }
    return { importedCount: createdIds.length, questionIds: createdIds };
  }
}
