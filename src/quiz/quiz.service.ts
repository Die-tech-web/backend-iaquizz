import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FilterQuizDto } from './dto/filter-quiz.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { QuizEntity } from './entities/quiz.entity';
import { QuizQuestionEntity } from './entities/quiz-question.entity';
import { QuizAttemptEntity } from './entities/quiz-attempt.entity';
import { QuizAnswerEntity } from './entities/quiz-answer.entity';
import { PatientProgressionEntity } from './entities/patient-progression.entity';
import { PatientEntity } from '../patient/entities/patient.entity';
import { PatientService } from '../patient/patient.service';
import { IcdService } from '../icd/icd.service';
import {
  MedicalTopicKey,
  MedicalTopicType,
} from '../common/enums/medical-topic.enum';
import {
  AdaptiveLevelDecision,
  QuizLevelAdaptationService,
} from './quiz-level-adaptation.service';
import {
  QuizAttemptStatus,
  QuizLevel,
  QuizQuestionType,
  QuizStatus,
  QuizTheme,
} from '../common/enums/quiz.enum';
import { PatientProfile } from '../common/enums/patient.enum';
import {
  DEFAULT_PATIENT_LANGUAGE,
  PatientLanguage,
  resolvePatientLanguage,
} from '../common/enums/language.enum';
import { NotificationService } from '../notification/notification.service';
import { QuizLocalizationService } from './quiz-localization.service';
import { ProfessionalService } from '../professional/professional.service';

export type QuizSubmissionResult = {
  id: string;
  language: PatientLanguage;
  score: number;
  maxScore: number;
  scoreOnTen: number;
  status: QuizAttemptStatus;
  completedAt: Date | null;
  levelAtAttempt: QuizLevel;
  currentLevel: QuizLevel;
  nextLevel: QuizLevel | null;
  progressionPercentage: number;
  perfectScoresAtCurrentLevel: number;
  requiredPerfectScoresForNextLevel: number;
  remainingPerfectScoresToUnlock: number;
  levelChanged: boolean;
  previousLevel: QuizLevel | null;
  congratulationMessage: string | null;
  correctAnswersCount?: number;
  totalQuestionsCount?: number;
};

export type QuizAttemptHistoryAnswer = {
  questionId: string;
  questionText: string;
  selectedCodes: string[];
  selectedLabels: string[];
  correctCodes: string[];
  correctLabels: string[];
  isCorrect: boolean;
};

export type QuizAttemptHistoryItem = {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  language: PatientLanguage;
  savedAt: Date;
  completedAt: Date | null;
  scoreOnTen: number;
  levelAtAttempt: QuizLevel;
  answers: QuizAttemptHistoryAnswer[];
};

export type PatientRecommendedQuizzesResult = {
  patientId: string;
  currentLevel: QuizLevel;
  nextLevel: QuizLevel | null;
  progressionPercentage: number;
  perfectScoresAtCurrentLevel: number;
  requiredPerfectScoresForNextLevel: number;
  remainingPerfectScoresToUnlock: number;
  recommendations: QuizEntity[];
};

@Injectable()
export class QuizService implements OnModuleInit {
  private readonly logger = new Logger(QuizService.name);
  private static readonly MIN_QUIZZES_PER_THEME = 10;
  private static readonly QUESTIONS_PER_ATTEMPT = 10;
  private static readonly LEVEL_ORDER: QuizLevel[] = [
    QuizLevel.BEGINNER,
    QuizLevel.INTERMEDIATE,
    QuizLevel.ADVANCED,
  ];

  constructor(
    @InjectRepository(QuizEntity)
    private readonly quizRepository: Repository<QuizEntity>,
    @InjectRepository(QuizQuestionEntity)
    private readonly questionRepository: Repository<QuizQuestionEntity>,
    @InjectRepository(QuizAttemptEntity)
    private readonly attemptRepository: Repository<QuizAttemptEntity>,
    @InjectRepository(QuizAnswerEntity)
    private readonly answerRepository: Repository<QuizAnswerEntity>,
    @InjectRepository(PatientProgressionEntity)
    private readonly progressionRepository: Repository<PatientProgressionEntity>,
    @InjectRepository(PatientEntity)
    private readonly patientRepository: Repository<PatientEntity>,
    private readonly icdService: IcdService,
    private readonly patientService: PatientService,
    private readonly professionalService: ProfessionalService,
    private readonly quizLevelAdaptationService: QuizLevelAdaptationService,
    private readonly quizLocalizationService: QuizLocalizationService,
    private readonly notificationService: NotificationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedQuizTemplates();
    await this.logThemeCoverageHealth();
  }

  async filter(dto: FilterQuizDto): Promise<QuizEntity[]> {
    const shouldAutoLevel = (dto.autoLevel ?? true) && !dto.level && Boolean(dto.patientId);
    const shouldValidateManualLevel = Boolean(dto.level && dto.patientId);
    const adaptiveDecision =
      (shouldAutoLevel || shouldValidateManualLevel) && dto.patientId
        ? await this.getAdaptiveLevelDecision(dto.patientId)
        : null;
    const effectiveLevel =
      dto.level && adaptiveDecision
        ? this.getAllowedRequestedLevel(dto.level, adaptiveDecision.currentLevel)
        : dto.level ?? adaptiveDecision?.recommendedLevel;

    let quizzes = await this.findPublishedQuizzes(dto, effectiveLevel);
    if (!quizzes.length && shouldAutoLevel && adaptiveDecision) {
      const fallbackLevels = this.getFallbackLevels(adaptiveDecision.recommendedLevel).filter(
        (level) => level !== adaptiveDecision.recommendedLevel,
      );

      for (const level of fallbackLevels) {
        quizzes = await this.findPublishedQuizzes(dto, level);
        if (quizzes.length) {
          this.logger.warn(
            `No quiz for adaptive level ${adaptiveDecision.recommendedLevel}. Fallback to ${level} for patient ${dto.patientId}.`,
          );
          break;
        }
      }
    }

    if (!dto.mainDisease && !dto.correlatedDiseases?.length && !dto.patientId) {
      const selectedWithoutSignals = await this.applyQuestionSelection(quizzes);
      return this.quizLocalizationService.localizeQuizzes(selectedWithoutSignals, dto.lang);
    }

    const enrichedCorrelations = new Set<MedicalTopicKey>(dto.correlatedDiseases ?? []);
    if (dto.mainDisease) {
      const correlations = await this.icdService.findCorrelations(dto.mainDisease);
      correlations.forEach((correlation) => enrichedCorrelations.add(correlation.correlatedTopic.key));
    }

    const patientConditions = dto.patientId
      ? (await this.patientService.findById(dto.patientId)).conditions.map((topic) => topic.key)
      : [];

    const allSignals = new Set<MedicalTopicKey>([...enrichedCorrelations, ...patientConditions]);
    const filtered = quizzes.filter((quiz) => {
      const relatedKeys = new Set<MedicalTopicKey>([
        quiz.mainTopic.key,
        ...quiz.relatedTopics.map((topic) => topic.key),
      ]);

      for (const key of allSignals) {
        if (relatedKeys.has(key)) {
          return true;
        }
      }

      return dto.mainDisease ? relatedKeys.has(dto.mainDisease) : true;
    });

    const selected = await this.applyQuestionSelection(filtered, dto.patientId);
    const ordered = await this.orderQuizzesByPatientHistory(selected, dto.patientId);
    return this.quizLocalizationService.localizeQuizzes(ordered, dto.lang);
  }

  async getAdaptiveLevelDecision(patientId: string): Promise<AdaptiveLevelDecision> {
    await this.patientService.findById(patientId);
    return this.resolveAdaptiveLevelDecision(patientId);
  }

  async getRecommendedQuizzesForPatient(
    patientId: string,
    dto: Omit<FilterQuizDto, 'patientId' | 'level' | 'autoLevel'> = {},
  ): Promise<PatientRecommendedQuizzesResult> {
    const patient = await this.patientService.findById(patientId);
    const progression = await this.getAdaptiveLevelDecision(patientId);
    const accessibleLevels = this.getAccessibleLevels(progression.currentLevel);
    const list = await this.filter({
      ...dto,
      patientId,
      autoLevel: false,
      patientProfile: dto.patientProfile ?? patient.profile,
    });
    const allowed = list
      .filter((quiz) => accessibleLevels.includes(quiz.level))
      .sort((left, right) => {
        const leftRank = QuizService.LEVEL_ORDER.indexOf(left.level);
        const rightRank = QuizService.LEVEL_ORDER.indexOf(right.level);
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        return left.title.localeCompare(right.title);
      });

    return {
      patientId,
      currentLevel: progression.currentLevel,
      nextLevel: progression.nextLevel,
      progressionPercentage: progression.progressionPercentage,
      perfectScoresAtCurrentLevel: progression.perfectScoresAtCurrentLevel,
      requiredPerfectScoresForNextLevel: progression.requiredPerfectScoresForNextLevel,
      remainingPerfectScoresToUnlock: progression.remainingPerfectScoresToUnlock,
      recommendations: allowed,
    };
  }

  private async findPublishedQuizzes(
    dto: FilterQuizDto,
    level?: QuizLevel,
  ): Promise<QuizEntity[]> {
    const qb = this.quizRepository
      .createQueryBuilder('quiz')
      .leftJoinAndSelect('quiz.questions', 'question')
      .leftJoinAndSelect('quiz.mainTopic', 'mainTopic')
      .leftJoinAndSelect('quiz.relatedTopics', 'relatedTopic')
      .where('quiz.status = :status', { status: QuizStatus.PUBLISHED })
      .orderBy('quiz.title', 'ASC');

    if (dto.mainDisease) {
      qb.andWhere('mainTopic.key = :mainDisease', { mainDisease: dto.mainDisease });
    }

    if (level) {
      qb.andWhere('quiz.level = :level', { level });
    }

    if (dto.themes?.length) {
      qb.andWhere('quiz.themes && :themes', { themes: dto.themes });
    }

    if (dto.patientProfile) {
      qb.andWhere('quiz.targetProfiles && :profiles', { profiles: [dto.patientProfile] });
    }

    return qb.getMany();
  }

  private getFallbackLevels(fromLevel: QuizLevel): QuizLevel[] {
    const fromIndex = QuizService.LEVEL_ORDER.indexOf(fromLevel);
    if (fromIndex <= 0) {
      return [QuizLevel.BEGINNER];
    }

    return QuizService.LEVEL_ORDER.slice(0, fromIndex + 1).reverse();
  }

  private getAccessibleLevels(currentLevel: QuizLevel) {
    const currentIndex = QuizService.LEVEL_ORDER.indexOf(currentLevel);
    if (currentIndex < 0) {
      return [QuizLevel.BEGINNER];
    }
    return QuizService.LEVEL_ORDER.slice(0, currentIndex + 1);
  }

  private getAllowedRequestedLevel(requested: QuizLevel, current: QuizLevel) {
    const requestedIndex = QuizService.LEVEL_ORDER.indexOf(requested);
    const currentIndex = QuizService.LEVEL_ORDER.indexOf(current);
    if (requestedIndex <= currentIndex) {
      return requested;
    }
    return current;
  }

  private async resolveAdaptiveLevelDecision(patientId: string): Promise<AdaptiveLevelDecision> {
    const patient = await this.patientService.findById(patientId);
    const progression = await this.ensurePatientProgression(patient);
    const attempts = await this.attemptRepository.find({
      where: {
        patient: { id: patientId },
        status: QuizAttemptStatus.COMPLETED,
      },
      order: { completedAt: 'DESC' },
      take: 50,
    });
    const snapshots = attempts.map((attempt) => ({
      levelAtAttempt: attempt.levelAtAttempt ?? attempt.quiz.level,
      score: Number(attempt.score ?? 0),
      maxScore: Number(attempt.maxScore ?? 10),
      completedAt: attempt.completedAt ?? attempt.startedAt,
    }));
    const decision = this.quizLevelAdaptationService.decide(
      snapshots,
      progression.currentLevel ?? patient.currentLevel,
    );

    if (
      progression.currentLevel !== decision.currentLevel ||
      progression.nextLevel !== decision.nextLevel ||
      Number(progression.progressionPercentage) !== decision.progressionPercentage ||
      progression.perfectScoresAtCurrentLevel !== decision.perfectScoresAtCurrentLevel ||
      progression.requiredPerfectScoresForNextLevel !== decision.requiredPerfectScoresForNextLevel
    ) {
      progression.currentLevel = decision.currentLevel;
      progression.nextLevel = decision.nextLevel;
      progression.progressionPercentage = decision.progressionPercentage;
      progression.perfectScoresAtCurrentLevel = decision.perfectScoresAtCurrentLevel;
      progression.requiredPerfectScoresForNextLevel = decision.requiredPerfectScoresForNextLevel;
      progression.totalCompletedAttempts = decision.completedAttempts;
      progression.totalPerfectScores = Object.values(decision.perfectScoresByLevel).reduce(
        (sum, value) => sum + value,
        0,
      );
      await this.progressionRepository.save(progression);
    }

    this.logger.log(
      `Adaptive level decision for patient ${patientId}: current=${decision.currentLevel}, recommended=${decision.recommendedLevel}, attempts=${decision.completedAttempts}, progression=${decision.progressionPercentage}%`,
    );
    return decision;
  }

  async findOne(quizId: string, lang?: PatientLanguage): Promise<QuizEntity> {
    const quiz = await this.quizRepository.findOne({
      where: { id: quizId },
      relations: { questions: true, mainTopic: true, relatedTopics: true },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz ${quizId} not found`);
    }

    return this.quizLocalizationService.localizeQuiz(quiz, lang);
  }

  async submit(dto: SubmitQuizDto): Promise<QuizSubmissionResult> {
    const patient = await this.patientService.findById(dto.patientId);
    const quiz = await this.findOne(dto.quizId);
    const patientLevelIndex = QuizService.LEVEL_ORDER.indexOf(patient.currentLevel ?? QuizLevel.BEGINNER);
    const quizLevelIndex = QuizService.LEVEL_ORDER.indexOf(quiz.level);
    if (quizLevelIndex > patientLevelIndex) {
      throw new ForbiddenException(
        `Ce quiz (${quiz.level}) n'est pas encore debloque pour ce patient (niveau actuel ${patient.currentLevel}).`,
      );
    }

    const levelAtAttempt = patient.currentLevel ?? QuizLevel.BEGINNER;
    const submittedQuestionIds = dto.answers
      .slice(0, QuizService.QUESTIONS_PER_ATTEMPT)
      .map((answer) => answer.questionId);

    const questions = submittedQuestionIds.length
      ? await this.questionRepository
          .createQueryBuilder('question')
          .where('question.id IN (:...submittedQuestionIds)', { submittedQuestionIds })
          .getMany()
      : [];
    const questionMap = new Map(questions.map((question) => [question.id, question]));

    const language = resolvePatientLanguage(dto.language ?? patient.preferredLanguage);

    const attempt = await this.attemptRepository.save(
      this.attemptRepository.create({
        patient,
        quiz,
        status: QuizAttemptStatus.IN_PROGRESS,
        levelAtAttempt,
        language,
      }),
    );

    let totalScore = 0;
    let maxScore = 0;
    let correctAnswersCount = 0;
    let totalQuestionsCount = 0;

    for (const submittedAnswer of dto.answers.slice(0, QuizService.QUESTIONS_PER_ATTEMPT)) {
      const question = questionMap.get(submittedAnswer.questionId);
      if (!question) {
        continue;
      }

      totalQuestionsCount += 1;

      const points = this.scoreAnswer(question, submittedAnswer.value);
      totalScore += points;
      maxScore += Number(question.weight);
      if (this.isExactCorrectAnswer(question, submittedAnswer.value)) {
        correctAnswersCount += 1;
      }

      await this.answerRepository.save(
        this.answerRepository.create({
          attempt,
          question,
          value: submittedAnswer.value,
          points,
        }),
      );
    }

    attempt.status = QuizAttemptStatus.COMPLETED;
    attempt.score = Number(totalScore.toFixed(2));
    attempt.maxScore = Number(maxScore.toFixed(2));
    attempt.completedAt = new Date();

    const savedAttempt = await this.attemptRepository.save(attempt);
    const progressionUpdate = await this.updateProgressionAfterSubmission({
      patient,
      levelAtAttempt,
      score: Number(savedAttempt.score ?? 0),
      maxScore: Number(savedAttempt.maxScore ?? maxScore ?? 0),
    });
    const scoreOnTen =
      totalQuestionsCount > 0
        ? Number(((correctAnswersCount / totalQuestionsCount) * 10).toFixed(2))
        : 0;
    await this.notificationService.createCriticalQuizNotifications({
      patient,
      attempt: savedAttempt,
      scoreOnTen,
    });

    return {
      id: savedAttempt.id,
      language: savedAttempt.language,
      score: progressionUpdate.score,
      maxScore: progressionUpdate.maxScore,
      scoreOnTen,
      status: savedAttempt.status,
      completedAt: savedAttempt.completedAt,
      levelAtAttempt,
      currentLevel: progressionUpdate.currentLevel,
      nextLevel: progressionUpdate.nextLevel,
      progressionPercentage: progressionUpdate.progressionPercentage,
      perfectScoresAtCurrentLevel: progressionUpdate.perfectScoresAtCurrentLevel,
      requiredPerfectScoresForNextLevel: progressionUpdate.requiredPerfectScoresForNextLevel,
      remainingPerfectScoresToUnlock: progressionUpdate.remainingPerfectScoresToUnlock,
      levelChanged: progressionUpdate.levelChanged,
      previousLevel: progressionUpdate.previousLevel,
      congratulationMessage: progressionUpdate.congratulationMessage,
      correctAnswersCount,
      totalQuestionsCount,
    };
  }

  async saveAttemptForPatient(attemptId: string, patientId: string): Promise<QuizAttemptHistoryItem> {
    await this.patientService.findById(patientId);
    const attempt = await this.attemptRepository.findOne({
      where: {
        id: attemptId,
        patient: { id: patientId },
        status: QuizAttemptStatus.COMPLETED,
      },
      relations: {
        quiz: true,
        answers: {
          question: true,
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(
        `Attempt ${attemptId} not found for patient ${patientId} or not completed`,
      );
    }

    if (!attempt.isSavedByPatient) {
      attempt.isSavedByPatient = true;
      attempt.savedAt = new Date();
      await this.attemptRepository.save(attempt);
    }

    if (!attempt.savedAt) {
      attempt.savedAt = new Date();
    }

    return this.toQuizAttemptHistoryItem(attempt);
  }

  async listSavedAttemptsForPatient(
    patientId: string,
    limit = 50,
  ): Promise<QuizAttemptHistoryItem[]> {
    await this.patientService.findById(patientId);
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const attempts = await this.attemptRepository.find({
      where: {
        patient: { id: patientId },
        status: QuizAttemptStatus.COMPLETED,
        isSavedByPatient: true,
      },
      relations: {
        quiz: true,
        answers: {
          question: true,
        },
      },
      order: {
        savedAt: 'DESC',
        completedAt: 'DESC',
      },
      take: safeLimit,
    });

    return attempts.map((attempt) => this.toQuizAttemptHistoryItem(attempt));
  }

  async listSavedAttemptsForProfessional(params: {
    professionalId: string;
    patientId: string;
    limit?: number;
  }): Promise<QuizAttemptHistoryItem[]> {
    const assignedPatientIds = await this.professionalService.getPatientIdsForProfessional(
      params.professionalId,
    );
    if (!assignedPatientIds.includes(params.patientId)) {
      throw new ForbiddenException('Ce patient n est pas assigne a ce professionnel');
    }

    const requested = params.limit ?? 2;
    const professionalLimit = Math.min(Math.max(requested, 1), 2);
    return this.listSavedAttemptsForPatient(params.patientId, professionalLimit);
  }

  private async ensurePatientProgression(patient: PatientEntity): Promise<PatientProgressionEntity> {
    const existing = await this.progressionRepository.findOne({
      where: { patient: { id: patient.id } },
    });
    if (existing) {
      return existing;
    }

    const attempts = await this.attemptRepository.find({
      where: {
        patient: { id: patient.id },
        status: QuizAttemptStatus.COMPLETED,
      },
      order: { completedAt: 'DESC' },
      take: 200,
    });
    const snapshots = attempts.map((attempt) => ({
      levelAtAttempt: attempt.levelAtAttempt ?? attempt.quiz.level,
      score: Number(attempt.score ?? 0),
      maxScore: Number(attempt.maxScore ?? 10),
      completedAt: attempt.completedAt ?? attempt.startedAt,
    }));
    const decision = this.quizLevelAdaptationService.decide(snapshots, patient.currentLevel);
    const progression = this.progressionRepository.create({
      patient,
      currentLevel: decision.currentLevel,
      nextLevel: decision.nextLevel,
      perfectScoresAtCurrentLevel: decision.perfectScoresAtCurrentLevel,
      requiredPerfectScoresForNextLevel: decision.requiredPerfectScoresForNextLevel,
      progressionPercentage: decision.progressionPercentage,
      totalCompletedAttempts: decision.completedAttempts,
      totalPerfectScores: Object.values(decision.perfectScoresByLevel).reduce(
        (sum, value) => sum + value,
        0,
      ),
      lastLevelUpAt: null,
    });
    if (patient.currentLevel !== decision.currentLevel) {
      patient.currentLevel = decision.currentLevel;
      await this.patientRepository.save(patient);
    }
    return this.progressionRepository.save(progression);
  }

  private async updateProgressionAfterSubmission(params: {
    patient: PatientEntity;
    levelAtAttempt: QuizLevel;
    score: number;
    maxScore: number;
  }) {
    const progression = await this.ensurePatientProgression(params.patient);
    const score = Number(params.score ?? 0);
    const maxScore = Number(params.maxScore ?? 0);
    const isPerfect = maxScore > 0 && score >= maxScore - 0.001;

    progression.totalCompletedAttempts += 1;
    if (isPerfect) {
      progression.totalPerfectScores += 1;
    }

    let previousLevel: QuizLevel | null = null;
    let congratulationMessage: string | null = null;
    let levelChanged = false;

    if (params.levelAtAttempt === progression.currentLevel && isPerfect) {
      progression.perfectScoresAtCurrentLevel += 1;
    }

    const required = this.quizLevelAdaptationService.getRequiredPerfectScores(progression.currentLevel);
    const next = this.quizLevelAdaptationService.getNextLevel(progression.currentLevel);

    progression.requiredPerfectScoresForNextLevel = required;
    progression.nextLevel = next;
    progression.progressionPercentage = next
      ? Number(
          (
            (Math.min(progression.perfectScoresAtCurrentLevel, required) / Math.max(required, 1)) *
            100
          ).toFixed(2),
        )
      : 100;

    if (next && progression.perfectScoresAtCurrentLevel >= required) {
      previousLevel = progression.currentLevel;
      progression.currentLevel = next;
      progression.nextLevel = this.quizLevelAdaptationService.getNextLevel(next);
      progression.perfectScoresAtCurrentLevel = 0;
      progression.requiredPerfectScoresForNextLevel =
        this.quizLevelAdaptationService.getRequiredPerfectScores(next);
      progression.progressionPercentage = progression.nextLevel ? 0 : 100;
      progression.lastLevelUpAt = new Date();
      levelChanged = true;
      congratulationMessage = this.quizLevelAdaptationService.buildLevelUpMessage(previousLevel, next);
    }

    if (params.patient.currentLevel !== progression.currentLevel) {
      params.patient.currentLevel = progression.currentLevel;
      await this.patientRepository.save(params.patient);
    }

    await this.progressionRepository.save(progression);

    return {
      score,
      maxScore,
      currentLevel: progression.currentLevel,
      nextLevel: progression.nextLevel,
      progressionPercentage: Number(progression.progressionPercentage),
      perfectScoresAtCurrentLevel: progression.perfectScoresAtCurrentLevel,
      requiredPerfectScoresForNextLevel: progression.requiredPerfectScoresForNextLevel,
      remainingPerfectScoresToUnlock: progression.nextLevel
        ? Math.max(
            progression.requiredPerfectScoresForNextLevel - progression.perfectScoresAtCurrentLevel,
            0,
          )
        : 0,
      levelChanged,
      previousLevel,
      congratulationMessage,
    };
  }

  async findAttemptById(attemptId: string): Promise<QuizAttemptEntity> {
    const attempt = await this.attemptRepository.findOne({
      where: { id: attemptId },
      relations: {
        patient: true,
        quiz: true,
        answers: {
          question: true,
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(`Attempt ${attemptId} not found`);
    }

    return attempt;
  }

  async getThemeCoverage() {
    const quizzes = await this.quizRepository.find({
      where: { status: QuizStatus.PUBLISHED },
      select: { themes: true },
    });

    const counts = new Map<QuizTheme, number>();
    Object.values(QuizTheme).forEach((theme) => counts.set(theme, 0));

    quizzes.forEach((quiz) => {
      quiz.themes.forEach((theme) => counts.set(theme, (counts.get(theme) ?? 0) + 1));
    });

    const themes = Object.values(QuizTheme).map((theme) => {
      const count = counts.get(theme) ?? 0;
      return {
        theme,
        count,
        minimumExpected: QuizService.MIN_QUIZZES_PER_THEME,
        isCompliant: count >= QuizService.MIN_QUIZZES_PER_THEME,
      };
    });

    return {
      minimumExpected: QuizService.MIN_QUIZZES_PER_THEME,
      totalPublishedQuizzes: quizzes.length,
      isCompliant: themes.every((item) => item.isCompliant),
      themes,
    };
  }

  private async logThemeCoverageHealth(): Promise<void> {
    const coverage = await this.getThemeCoverage();
    if (coverage.isCompliant) {
      this.logger.log(
        `Theme coverage OK: minimum ${coverage.minimumExpected} quiz per theme reached.`,
      );
      return;
    }

    const missing = coverage.themes
      .filter((theme) => !theme.isCompliant)
      .map((theme) => `${theme.theme}=${theme.count}`)
      .join(', ');

    this.logger.warn(
      `Theme coverage below target (${coverage.minimumExpected}/theme): ${missing}`,
    );
  }

  private scoreAnswer(question: QuizQuestionEntity, values: string[]): number {
    if (!question.options?.length) {
      return 0;
    }

    const expected = question.options.filter((option) => option.isCorrect).map((option) => option.code);
    const submitted = values.slice().sort().join('|');
    const expectedSignature = expected.slice().sort().join('|');

    if (submitted === expectedSignature) {
      return Number(question.weight);
    }

    if (question.type === QuizQuestionType.MULTIPLE_CHOICE) {
      const overlap = values.filter((value) => expected.includes(value)).length;
      return Number(((overlap / Math.max(expected.length, 1)) * Number(question.weight)).toFixed(2));
    }

    return 0;
  }

  private isExactCorrectAnswer(question: QuizQuestionEntity, values: string[]): boolean {
    if (!question.options?.length) {
      return false;
    }

    const expected = question.options.filter((option) => option.isCorrect).map((option) => option.code);
    return values.slice().sort().join('|') === expected.slice().sort().join('|');
  }

  private shuffle<T>(values: T[]): T[] {
    const buffer = [...values];
    for (let i = buffer.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [buffer[i], buffer[j]] = [buffer[j], buffer[i]];
    }
    return buffer;
  }

  private normalizeQuestionText(value: string): string {
    return value
      .toLowerCase()
      .replace(/\(quiz\s*\d+\)/gi, '')
      .replace(/dans le module [^,]+,\s*/gi, '')
      .replace(
        /\b(apres apparition d un oedeme des membres inferieurs|face a une prise de poids rapide|quand les resultats biologiques evoluent|avant le renouvellement du traitement|durant une semaine de fatigue persistante|apres un oubli de medicament|en presence de crampes nocturnes|apres un ecart alimentaire notable|devant une tension arterielle elevee|lors d un essoufflement inhabituel)\b/gi,
        'en contexte patient',
      )
      .replace(
        /\b(au domicile|en consultation|au moment du traitement|lors du suivi mensuel|en prevention quotidienne|en phase de stabilisation|en coordination avec l equipe soignante|lors du controle biologique|en contexte de comorbidite|dans le parcours educatif)\b/gi,
        'en contexte patient',
      )
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getQuestionSignature(
    question: Pick<QuizQuestionEntity, 'text' | 'options'>,
  ): string {
    const text = this.normalizeQuestionText(question.text);
    const options = (question.options ?? [])
      .map((option) => {
        const label = this.normalizeQuestionText(option.label);
        return label;
      })
      .sort()
      .join('|');

    return `${text}::${options}`;
  }

  private getOptionSignature(question: Pick<QuizQuestionEntity, 'options'>): string {
    return (question.options ?? [])
      .map((option) => {
        const label = this.normalizeQuestionText(option.label);
        return label;
      })
      .sort()
      .join('|');
  }

  private toQuizAttemptHistoryItem(attempt: QuizAttemptEntity): QuizAttemptHistoryItem {
    const language = resolvePatientLanguage(attempt.language);
    const answers = (attempt.answers ?? []).map((answer) => {
      const question = answer.question;
      const selectedCodes = answer.value ?? [];
      const selectedCodeSet = new Set(selectedCodes);
      const localizedOptions = (question.options ?? []).map((option) => ({
        ...option,
        label: this.pickLocalizedValue(option.label, option.labelI18n, language),
      }));
      const selectedLabels = localizedOptions
        .filter((option) => selectedCodeSet.has(option.code))
        .map((option) => option.label);
      const correctOptions = localizedOptions.filter((option) => option.isCorrect);
      const correctCodes = correctOptions.map((option) => option.code);
      const correctLabels = correctOptions.map((option) => option.label);

      return {
        questionId: question.id,
        questionText: this.pickLocalizedValue(question.text, question.textI18n, language),
        selectedCodes,
        selectedLabels,
        correctCodes,
        correctLabels,
        isCorrect:
          selectedCodes.slice().sort().join('|') === correctCodes.slice().sort().join('|'),
      };
    });

    const score = Number(attempt.score ?? 0);
    const maxScore = Number(attempt.maxScore ?? 0);
    const scoreOnTen = maxScore > 0 ? Number(((score / maxScore) * 10).toFixed(2)) : 0;

    return {
      attemptId: attempt.id,
      quizId: attempt.quiz.id,
      quizTitle: this.pickLocalizedValue(attempt.quiz.title, attempt.quiz.titleI18n, language),
      language,
      savedAt: attempt.savedAt ?? attempt.completedAt ?? attempt.startedAt,
      completedAt: attempt.completedAt,
      scoreOnTen,
      levelAtAttempt: attempt.levelAtAttempt ?? attempt.quiz.level,
      answers,
    };
  }

  private pickLocalizedValue(
    baseValue: string,
    i18nMap: Partial<Record<PatientLanguage, string>> | undefined,
    language: PatientLanguage,
  ): string {
    const preferred = i18nMap?.[language];
    if (preferred && preferred.trim()) {
      return preferred;
    }

    if (language !== DEFAULT_PATIENT_LANGUAGE) {
      const fallback = i18nMap?.[DEFAULT_PATIENT_LANGUAGE];
      if (fallback && fallback.trim()) {
        return fallback;
      }
    }

    return baseValue;
  }

  private haveThemeOverlap(left: QuizTheme[], right: QuizTheme[]) {
    if (!left.length || !right.length) {
      return false;
    }

    const rightSet = new Set(right);
    return left.some((theme) => rightSet.has(theme));
  }

  private buildSeenSignaturesForQuiz(
    themes: QuizTheme[],
    seenByTheme: Map<QuizTheme, Set<string>>,
  ): Set<string> {
    const signatures = new Set<string>();
    themes.forEach((theme) => {
      const bucket = seenByTheme.get(theme);
      bucket?.forEach((signature) => signatures.add(signature));
    });
    return signatures;
  }

  private appendQuestions(
    selectedQuestions: QuizQuestionEntity[],
    selectedSignatures: Set<string>,
    selectedOptionSignatures: Set<string>,
    candidates: Array<{ question: QuizQuestionEntity; signature: string }>,
    seenSignatures: Set<string>,
    options?: { includeSeen?: boolean; includeRepeatedOptions?: boolean },
  ) {
    const ordered = this.shuffle(candidates);
    const includeSeen = options?.includeSeen ?? false;
    const includeRepeatedOptions = options?.includeRepeatedOptions ?? false;

    for (const candidate of ordered) {
      if (selectedQuestions.length >= QuizService.QUESTIONS_PER_ATTEMPT) {
        break;
      }

      if (selectedSignatures.has(candidate.signature)) {
        continue;
      }

      const isSeen = seenSignatures.has(candidate.signature);
      if (!includeSeen && isSeen) {
        continue;
      }

      const optionSignature = this.getOptionSignature(candidate.question);
      if (!includeRepeatedOptions && selectedOptionSignatures.has(optionSignature)) {
        continue;
      }

      selectedQuestions.push(candidate.question);
      selectedSignatures.add(candidate.signature);
      selectedOptionSignatures.add(optionSignature);
    }
  }

  private selectQuestionsForQuiz(
    quiz: QuizEntity,
    quizzes: QuizEntity[],
    seenByTheme: Map<QuizTheme, Set<string>>,
  ) {
    const quizThemes = quiz.themes ?? [];
    const seenSignatures = this.buildSeenSignaturesForQuiz(quizThemes, seenByTheme);
    const allCandidates = quizzes.flatMap((sourceQuiz) =>
      sourceQuiz.questions.map((question) => ({
        sourceQuiz,
        question,
        signature: this.getQuestionSignature(question),
      })),
    );

    const ownCandidates = allCandidates.filter((candidate) => candidate.sourceQuiz.id === quiz.id);
    const sameThemeSameLevel = allCandidates.filter(
      (candidate) =>
        candidate.sourceQuiz.id !== quiz.id &&
        candidate.sourceQuiz.level === quiz.level &&
        this.haveThemeOverlap(candidate.sourceQuiz.themes ?? [], quizThemes),
    );
    const sameThemeAnyLevel = allCandidates.filter(
      (candidate) =>
        candidate.sourceQuiz.id !== quiz.id &&
        this.haveThemeOverlap(candidate.sourceQuiz.themes ?? [], quizThemes),
    );

    const selectedQuestions: QuizQuestionEntity[] = [];
    const selectedSignatures = new Set<string>();
    const selectedOptionSignatures = new Set<string>();
    const candidatePools = [ownCandidates, sameThemeSameLevel, sameThemeAnyLevel, allCandidates];

    const phases: Array<{ includeSeen: boolean; includeRepeatedOptions: boolean }> = [
      { includeSeen: false, includeRepeatedOptions: false },
      { includeSeen: false, includeRepeatedOptions: true },
      { includeSeen: true, includeRepeatedOptions: false },
      { includeSeen: true, includeRepeatedOptions: true },
    ];

    for (const phase of phases) {
      if (selectedQuestions.length >= QuizService.QUESTIONS_PER_ATTEMPT) {
        break;
      }

      for (const pool of candidatePools) {
        if (selectedQuestions.length >= QuizService.QUESTIONS_PER_ATTEMPT) {
          break;
        }

        this.appendQuestions(
          selectedQuestions,
          selectedSignatures,
          selectedOptionSignatures,
          pool,
          seenSignatures,
          phase,
        );
      }
    }

    return selectedQuestions.slice(0, QuizService.QUESTIONS_PER_ATTEMPT);
  }

  private async orderQuizzesByPatientHistory(quizzes: QuizEntity[], patientId?: string) {
    if (!patientId || quizzes.length <= 1) {
      return quizzes;
    }

    const quizIds = quizzes.map((quiz) => quiz.id);
    const rows = await this.attemptRepository
      .createQueryBuilder('attempt')
      .select('attempt.quiz_id', 'quizId')
      .addSelect('COUNT(attempt.id)', 'attemptCount')
      .where('attempt.patient_id = :patientId', { patientId })
      .andWhere('attempt.status = :status', { status: QuizAttemptStatus.COMPLETED })
      .andWhere('attempt.quiz_id IN (:...quizIds)', { quizIds })
      .groupBy('attempt.quiz_id')
      .getRawMany<{ quizId: string; attemptCount: string }>();

    const historyMap = new Map(
      rows.map((row) => [
        row.quizId,
        {
          count: Number(row.attemptCount),
        },
      ]),
    );

    const shuffled = this.shuffle([...quizzes]);
    return shuffled.sort((left, right) => {
      const leftHistory = historyMap.get(left.id) ?? { count: 0 };
      const rightHistory = historyMap.get(right.id) ?? { count: 0 };

      if (leftHistory.count !== rightHistory.count) {
        return leftHistory.count - rightHistory.count;
      }

      return 0;
    });
  }

  private async applyQuestionSelection(quizzes: QuizEntity[], patientId?: string) {
    if (!quizzes.length) {
      return quizzes;
    }

    const seenByTheme = new Map<QuizTheme, Set<string>>();
    if (patientId) {
      const seenAnswers = await this.answerRepository
        .createQueryBuilder('answer')
        .innerJoin('answer.attempt', 'attempt')
        .innerJoinAndSelect('answer.question', 'question')
        .innerJoinAndSelect('question.quiz', 'quiz')
        .where('attempt.patient_id = :patientId', { patientId })
        .andWhere('attempt.status = :status', { status: QuizAttemptStatus.COMPLETED })
        .getMany();

      seenAnswers.forEach((answer) => {
        const answeredQuiz = answer.question?.quiz;
        if (!answeredQuiz) {
          return;
        }

        const signature = this.getQuestionSignature(answer.question);
        (answeredQuiz.themes ?? []).forEach((theme) => {
          const bucket = seenByTheme.get(theme) ?? new Set<string>();
          bucket.add(signature);
          seenByTheme.set(theme, bucket);
        });
      });
    }

    return quizzes.map((quiz) => {
      return {
        ...quiz,
        questions: this.selectQuestionsForQuiz(quiz, quizzes, seenByTheme),
      };
    });
  }

  private async seedQuizTemplates(): Promise<void> {
    const topicMap = await this.icdService.getTopicMapByKeys(Object.values(MedicalTopicKey));
    const ckd = topicMap.get(MedicalTopicKey.CHRONIC_KIDNEY_DISEASE);
    const diabetes = topicMap.get(MedicalTopicKey.DIABETES);
    const htn = topicMap.get(MedicalTopicKey.HYPERTENSION);
    const dialysis = topicMap.get(MedicalTopicKey.DIALYSIS);
    const nutrition = topicMap.get(MedicalTopicKey.NUTRITION);

    if (!ckd || !diabetes || !htn || !dialysis || !nutrition) {
      this.logger.warn('Topic catalog not ready. Quiz seeding skipped.');
      return;
    }

    const baseTemplates = [
      {
        title: 'Module renal - Quiz principal',
        slug: 'module-renal-quiz-principal',
        description:
          'Quiz unique sur les maladies renales avec 30 questions distinctes de parcours patient.',
        status: QuizStatus.PUBLISHED,
        level: QuizLevel.INTERMEDIATE,
        themes: [
          QuizTheme.FOLLOW_UP,
          QuizTheme.TREATMENT,
          QuizTheme.NUTRITION,
          QuizTheme.PREVENTION,
          QuizTheme.ADHERENCE,
        ],
        targetProfiles: Object.values(PatientProfile),
        supportsDialysisContext: true,
        mainTopic: ckd,
        relatedTopics: [diabetes, htn, dialysis, nutrition],
        questions: [
          {
            linkId: 'q1',
            text: 'Quel indicateur est central pour suivre la fonction renale ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'DFG/eGFR', isCorrect: true },
              { code: 'B', label: 'Frequence cardiaque seule', isCorrect: false },
              { code: 'C', label: 'Poids sans autres bilans', isCorrect: false },
            ],
          },
          {
            linkId: 'q2',
            text: 'En IRC, quel facteur accelere le plus la progression de la maladie ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'HTA mal controlee', isCorrect: true },
              { code: 'B', label: 'Sommeil regulier', isCorrect: false },
              { code: 'C', label: 'Hydratation adaptee', isCorrect: false },
            ],
          },
          {
            linkId: 'q3',
            text: 'Quel comportement est recommande pour les medicaments en nephrologie ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Respecter la prescription et signaler les oublis', isCorrect: true },
              { code: 'B', label: 'Doubler la dose apres oubli', isCorrect: false },
              { code: 'C', label: 'Arreter sans avis medical', isCorrect: false },
            ],
          },
          {
            linkId: 'q4',
            text: 'Pour limiter la surcharge hydrosodee, quel conseil est pertinent ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Limiter le sel selon avis medical', isCorrect: true },
              { code: 'B', label: 'Ajouter du sel a chaque repas', isCorrect: false },
              { code: 'C', label: 'Boire sans limite', isCorrect: false },
            ],
          },
          {
            linkId: 'q5',
            text: 'En dialyse, quel signe doit etre signale rapidement ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Malaise ou crampes intenses', isCorrect: true },
              { code: 'B', label: 'Faim passagere', isCorrect: false },
              { code: 'C', label: 'Envie de marcher', isCorrect: false },
            ],
          },
          {
            linkId: 'q6',
            text: 'Le diabete mal controle peut-il aggraver l IRC ?',
            type: QuizQuestionType.BOOLEAN,
            weight: 1,
            options: [
              { code: 'TRUE', label: 'Oui', isCorrect: true },
              { code: 'FALSE', label: 'Non', isCorrect: false },
            ],
          },
          {
            linkId: 'q7',
            text: 'Quel axe de prevention est le plus utile en parcours cardio-renal ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Suivi regulier tension + glycemie', isCorrect: true },
              { code: 'B', label: 'Aucun controle a domicile', isCorrect: false },
              { code: 'C', label: 'Automedication prolongee', isCorrect: false },
            ],
          },
          {
            linkId: 'q8',
            text: 'En cas d oubli repete de traitement, quelle conduite est adaptee ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Prevenir l equipe soignante', isCorrect: true },
              { code: 'B', label: 'Changer seul le traitement', isCorrect: false },
              { code: 'C', label: 'Interrompre completement', isCorrect: false },
            ],
          },
          {
            linkId: 'q9',
            text: 'Quelle habitude de vie soutient le mieux la stabilite renale ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Routine de suivi et activite adaptee', isCorrect: true },
              { code: 'B', label: 'Sedentarite continue', isCorrect: false },
              { code: 'C', label: 'Absence de sommeil regulier', isCorrect: false },
            ],
          },
          {
            linkId: 'q10',
            text: 'Quel examen complete le mieux le suivi du rein avec le DFG ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Albuminurie/proteinurie', isCorrect: true },
              { code: 'B', label: 'Vision de loin', isCorrect: false },
              { code: 'C', label: 'Pointure', isCorrect: false },
            ],
          },
          {
            linkId: 'q11',
            text: 'Quel objectif principal vise la nephroprotection chez un patient IRC ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Ralentir la perte de fonction renale', isCorrect: true },
              { code: 'B', label: 'Supprimer tout traitement chronique', isCorrect: false },
              { code: 'C', label: 'Ignorer les facteurs cardio-metaboliques', isCorrect: false },
            ],
          },
          {
            linkId: 'q12',
            text: 'Quel examen est souvent suivi avec le DFG pour surveiller l IRC ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Creatininemie', isCorrect: true },
              { code: 'B', label: 'Champ visuel', isCorrect: false },
              { code: 'C', label: 'Tour de tete', isCorrect: false },
            ],
          },
          {
            linkId: 'q13',
            text: 'Une adherence therapeutique faible expose surtout a quel risque ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Decompensation et aggravation renale', isCorrect: true },
              { code: 'B', label: 'Aucun impact clinique', isCorrect: false },
              { code: 'C', label: 'Amelioration spontanee', isCorrect: false },
            ],
          },
          {
            linkId: 'q14',
            text: 'Quel parametre quotidien aide a prevenir la surcharge en dialyse ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Suivi du poids inter-dialytique', isCorrect: true },
              { code: 'B', label: 'Nombre de pas uniquement', isCorrect: false },
              { code: 'C', label: 'Couleur des vetements', isCorrect: false },
            ],
          },
          {
            linkId: 'q15',
            text: 'Quel lien entre diabete et rein est correct ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Le diabete est une cause majeure de nephropathie', isCorrect: true },
              { code: 'B', label: 'Le diabete protege la fonction renale', isCorrect: false },
              { code: 'C', label: 'Il n existe aucun lien', isCorrect: false },
            ],
          },
          {
            linkId: 'q16',
            text: 'En cas de symptomes inhabituels sous traitement, que faire ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Contacter rapidement l equipe soignante', isCorrect: true },
              { code: 'B', label: 'Arreter tous les medicaments seul', isCorrect: false },
              { code: 'C', label: 'Attendre plusieurs semaines', isCorrect: false },
            ],
          },
          {
            linkId: 'q17',
            text: 'Quel facteur alimentaire est classiquement limite en IRC selon avis medical ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Le sodium (sel)', isCorrect: true },
              { code: 'B', label: 'Les fibres exclusivement', isCorrect: false },
              { code: 'C', label: 'L eau en toute circonstance', isCorrect: false },
            ],
          },
          {
            linkId: 'q18',
            text: 'Un suivi tensionnel regulier chez un patient IRC est-il utile ?',
            type: QuizQuestionType.BOOLEAN,
            weight: 1,
            options: [
              { code: 'TRUE', label: 'Oui', isCorrect: true },
              { code: 'FALSE', label: 'Non', isCorrect: false },
            ],
          },
          {
            linkId: 'q19',
            text: 'Quelle attitude est la plus sure vis-a-vis des anti-inflammatoires sans avis ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Eviter l automedication', isCorrect: true },
              { code: 'B', label: 'En prendre systematiquement', isCorrect: false },
              { code: 'C', label: 'Doubler les doses en douleur', isCorrect: false },
            ],
          },
          {
            linkId: 'q20',
            text: 'Quel signe peut traduire une retention hydrique ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Oedemes des membres inferieurs', isCorrect: true },
              { code: 'B', label: 'Amelioration de l effort', isCorrect: false },
              { code: 'C', label: 'Perte d appetit isolee', isCorrect: false },
            ],
          },
          {
            linkId: 'q21',
            text: 'Quel est l objectif du suivi biologique periodique en IRC ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Adapter precocement la prise en charge', isCorrect: true },
              { code: 'B', label: 'Remplacer toute consultation', isCorrect: false },
              { code: 'C', label: 'Confirmer que le suivi est inutile', isCorrect: false },
            ],
          },
          {
            linkId: 'q22',
            text: 'Quel couple de comorbidites augmente le risque renal global ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Diabete et HTA', isCorrect: true },
              { code: 'B', label: 'Rhinite et myopie', isCorrect: false },
              { code: 'C', label: 'Dermatite et otite', isCorrect: false },
            ],
          },
          {
            linkId: 'q23',
            text: 'En dialyse, le respect des seances est-il essentiel ?',
            type: QuizQuestionType.BOOLEAN,
            weight: 1,
            options: [
              { code: 'TRUE', label: 'Oui', isCorrect: true },
              { code: 'FALSE', label: 'Non', isCorrect: false },
            ],
          },
          {
            linkId: 'q24',
            text: 'Quelle strategie aide a ne pas oublier les medicaments ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Pilulier et rappels horaires', isCorrect: true },
              { code: 'B', label: 'Prise aleatoire selon humeur', isCorrect: false },
              { code: 'C', label: 'Arret le week-end', isCorrect: false },
            ],
          },
          {
            linkId: 'q25',
            text: 'Quel message nutritionnel est correct pour un patient IRC ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Plan alimentaire personnalise avec suivi', isCorrect: true },
              { code: 'B', label: 'Regime extreme sans supervision', isCorrect: false },
              { code: 'C', label: 'Aucune adaptation necessaire', isCorrect: false },
            ],
          },
          {
            linkId: 'q26',
            text: 'Quel examen peut aider a surveiller le potassium en contexte renal ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Ionogramme sanguin', isCorrect: true },
              { code: 'B', label: 'Audiometrie', isCorrect: false },
              { code: 'C', label: 'Fond d oeil seul', isCorrect: false },
            ],
          },
          {
            linkId: 'q27',
            text: 'Face a une fatigue inhabituelle persistante, quelle conduite est adaptee ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Signaler lors du suivi medical', isCorrect: true },
              { code: 'B', label: 'Suspendre les controles', isCorrect: false },
              { code: 'C', label: 'Ignorer durablement', isCorrect: false },
            ],
          },
          {
            linkId: 'q28',
            text: 'Quel objectif vise la prevention cardio-renale ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Limiter les complications coeur-rein', isCorrect: true },
              { code: 'B', label: 'Supprimer toute activite physique', isCorrect: false },
              { code: 'C', label: 'Arreter le suivi tensionnel', isCorrect: false },
            ],
          },
          {
            linkId: 'q29',
            text: 'Le suivi des rendez-vous nephrologiques est-il important ?',
            type: QuizQuestionType.BOOLEAN,
            weight: 1,
            options: [
              { code: 'TRUE', label: 'Oui', isCorrect: true },
              { code: 'FALSE', label: 'Non', isCorrect: false },
            ],
          },
          {
            linkId: 'q30',
            text: 'Quel comportement est le plus protecteur pour le rein au long cours ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Suivi medical regulier et adherence', isCorrect: true },
              { code: 'B', label: 'Automedication repetitive', isCorrect: false },
              { code: 'C', label: 'Arret du parcours de soins', isCorrect: false },
            ],
          },
        ],
      },
      {
        title: 'IRC et Dialyse - Bases patient',
        slug: 'irc-dialyse-bases',
        description: 'Comprendre les principes de suivi en insuffisance renale chronique.',
        status: QuizStatus.PUBLISHED,
        level: QuizLevel.BEGINNER,
        themes: [QuizTheme.FOLLOW_UP, QuizTheme.TREATMENT, QuizTheme.NUTRITION],
        targetProfiles: [PatientProfile.CHRONIC, PatientProfile.DIALYSIS],
        supportsDialysisContext: true,
        mainTopic: ckd,
        relatedTopics: [diabetes, htn, dialysis, nutrition],
        questions: [
          {
            linkId: 'q1',
            text: 'Quelle maladie est frequemment associee a l insuffisance renale chronique ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Diabete', isCorrect: true },
              { code: 'B', label: 'Rhume saisonnier', isCorrect: false },
              { code: 'C', label: 'Entorse de cheville', isCorrect: false },
            ],
          },
          {
            linkId: 'q2',
            text: 'Quels axes sont prioritaires en dialyse ?',
            type: QuizQuestionType.MULTIPLE_CHOICE,
            weight: 2,
            options: [
              { code: 'A', label: 'Observance du traitement', isCorrect: true },
              { code: 'B', label: 'Suivi nutritionnel', isCorrect: true },
              { code: 'C', label: 'Automedication sans suivi', isCorrect: false },
            ],
          },
        ],
      },
      {
        title: 'Diabete et prevention renale',
        slug: 'diabete-prevention-renale',
        description: 'Prevenir l atteinte renale chez un patient diabetique.',
        status: QuizStatus.PUBLISHED,
        level: QuizLevel.INTERMEDIATE,
        themes: [QuizTheme.PREVENTION, QuizTheme.RISK_FACTORS],
        targetProfiles: [PatientProfile.AT_RISK, PatientProfile.COMORBID],
        supportsDialysisContext: false,
        mainTopic: diabetes,
        relatedTopics: [ckd, htn],
        questions: [
          {
            linkId: 'q1',
            text: 'Le controle glycemique aide-t-il a proteger le rein ?',
            type: QuizQuestionType.BOOLEAN,
            weight: 1,
            options: [
              { code: 'TRUE', label: 'Oui', isCorrect: true },
              { code: 'FALSE', label: 'Non', isCorrect: false },
            ],
          },
        ],
      },
      {
        title: 'HTA et rein - suivi quotidien',
        slug: 'hta-rein-suivi-quotidien',
        description: 'Comprendre le role de la tension arterielle dans la sante renale.',
        status: QuizStatus.PUBLISHED,
        level: QuizLevel.BEGINNER,
        themes: [QuizTheme.FOLLOW_UP, QuizTheme.ADHERENCE],
        targetProfiles: [PatientProfile.CHRONIC, PatientProfile.COMORBID],
        supportsDialysisContext: false,
        mainTopic: htn,
        relatedTopics: [ckd, diabetes],
        questions: [
          {
            linkId: 'q1',
            text: 'Une hypertension mal controlee peut-elle accelerer l atteinte renale ?',
            type: QuizQuestionType.BOOLEAN,
            weight: 1,
            options: [
              { code: 'TRUE', label: 'Oui', isCorrect: true },
              { code: 'FALSE', label: 'Non', isCorrect: false },
            ],
          },
        ],
      },
      {
        title: 'Nutrition protectrice en IRC',
        slug: 'nutrition-protectrice-irc',
        description: 'Bonnes pratiques nutritionnelles pour limiter les complications.',
        status: QuizStatus.PUBLISHED,
        level: QuizLevel.INTERMEDIATE,
        themes: [QuizTheme.NUTRITION, QuizTheme.LIFESTYLE],
        targetProfiles: [PatientProfile.CHRONIC, PatientProfile.AT_RISK],
        supportsDialysisContext: true,
        mainTopic: nutrition,
        relatedTopics: [ckd, diabetes, dialysis],
        questions: [
          {
            linkId: 'q1',
            text: 'Quel axe est le plus utile pour reduire la surcharge hydrosodee ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Limiter sel et liquides selon avis medical', isCorrect: true },
              { code: 'B', label: 'Boire sans limite', isCorrect: false },
              { code: 'C', label: 'Supprimer tout repas', isCorrect: false },
            ],
          },
        ],
      },
      {
        title: 'Dialyse - securite de seance',
        slug: 'dialyse-securite-seance',
        description: 'Identifier les signes a signaler avant, pendant et apres la seance.',
        status: QuizStatus.PUBLISHED,
        level: QuizLevel.INTERMEDIATE,
        themes: [QuizTheme.TREATMENT, QuizTheme.COMPLICATIONS],
        targetProfiles: [PatientProfile.DIALYSIS],
        supportsDialysisContext: true,
        mainTopic: dialysis,
        relatedTopics: [ckd, htn],
        questions: [
          {
            linkId: 'q1',
            text: 'Quel symptome doit etre signale rapidement pendant la dialyse ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Malaise ou crampes intenses', isCorrect: true },
              { code: 'B', label: 'Faim moderee', isCorrect: false },
              { code: 'C', label: 'Envie de marcher', isCorrect: false },
            ],
          },
        ],
      },
      {
        title: 'Comorbidites diabete + HTA',
        slug: 'comorbidites-diabete-hta',
        description: 'Evaluer les risques combines pour la fonction renale.',
        status: QuizStatus.PUBLISHED,
        level: QuizLevel.ADVANCED,
        themes: [QuizTheme.RISK_FACTORS, QuizTheme.PREVENTION],
        targetProfiles: [PatientProfile.COMORBID, PatientProfile.CHRONIC],
        supportsDialysisContext: false,
        mainTopic: diabetes,
        relatedTopics: [htn, ckd],
        questions: [
          {
            linkId: 'q1',
            text: 'Quel duo augmente le plus le risque de progression vers l IRC ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Diabete mal controle + HTA', isCorrect: true },
              { code: 'B', label: 'Rhinite + toux', isCorrect: false },
              { code: 'C', label: 'Sport + hydratation', isCorrect: false },
            ],
          },
        ],
      },
      {
        title: 'Adherence therapeutique en nephrologie',
        slug: 'adherence-therapeutique-nephro',
        description: 'Renforcer la regularite des traitements et du suivi.',
        status: QuizStatus.PUBLISHED,
        level: QuizLevel.BEGINNER,
        themes: [QuizTheme.ADHERENCE, QuizTheme.FOLLOW_UP],
        targetProfiles: [PatientProfile.CHRONIC, PatientProfile.STANDARD],
        supportsDialysisContext: true,
        mainTopic: ckd,
        relatedTopics: [dialysis, nutrition],
        questions: [
          {
            linkId: 'q1',
            text: 'Que faire en cas d oubli repete de medicaments ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Informer l equipe soignante', isCorrect: true },
              { code: 'B', label: 'Arreter tout traitement', isCorrect: false },
              { code: 'C', label: 'Doubler sans avis', isCorrect: false },
            ],
          },
        ],
      },
      {
        title: 'Prevention des complications cardio-renales',
        slug: 'prevention-complications-cardio-renales',
        description: 'Comprendre les liens coeur-rein et la prevention secondaire.',
        status: QuizStatus.PUBLISHED,
        level: QuizLevel.INTERMEDIATE,
        themes: [QuizTheme.PREVENTION, QuizTheme.COMPLICATIONS],
        targetProfiles: [PatientProfile.AT_RISK, PatientProfile.COMORBID],
        supportsDialysisContext: false,
        mainTopic: htn,
        relatedTopics: [ckd, diabetes, nutrition],
        questions: [
          {
            linkId: 'q1',
            text: 'Le suivi regulier de la pression arterielle a domicile est-il utile ?',
            type: QuizQuestionType.BOOLEAN,
            weight: 1,
            options: [
              { code: 'TRUE', label: 'Oui', isCorrect: true },
              { code: 'FALSE', label: 'Non', isCorrect: false },
            ],
          },
        ],
      },
      {
        title: 'Vie quotidienne et dialyse',
        slug: 'vie-quotidienne-dialyse',
        description: 'Adapter le quotidien autour des seances et de la fatigue.',
        status: QuizStatus.PUBLISHED,
        level: QuizLevel.BEGINNER,
        themes: [QuizTheme.LIFESTYLE, QuizTheme.FOLLOW_UP],
        targetProfiles: [PatientProfile.DIALYSIS, PatientProfile.CHRONIC],
        supportsDialysisContext: true,
        mainTopic: dialysis,
        relatedTopics: [nutrition, ckd],
        questions: [
          {
            linkId: 'q1',
            text: 'Quelle habitude aide le plus entre deux seances ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'Respecter le plan hydrique prescrit', isCorrect: true },
              { code: 'B', label: 'Ignorer les consignes', isCorrect: false },
              { code: 'C', label: 'Changer de traitement seul', isCorrect: false },
            ],
          },
        ],
      },
      {
        title: 'Risque reno-metabolique global',
        slug: 'risque-reno-metabolique-global',
        description: 'Evaluation globale des facteurs metabolique et renaux.',
        status: QuizStatus.PUBLISHED,
        level: QuizLevel.ADVANCED,
        themes: [QuizTheme.RISK_FACTORS, QuizTheme.TREATMENT],
        targetProfiles: [PatientProfile.COMORBID, PatientProfile.AT_RISK],
        supportsDialysisContext: false,
        mainTopic: ckd,
        relatedTopics: [diabetes, htn, nutrition],
        questions: [
          {
            linkId: 'q1',
            text: 'Quel indicateur est central pour suivre la fonction renale ?',
            type: QuizQuestionType.SINGLE_CHOICE,
            weight: 1,
            options: [
              { code: 'A', label: 'DFG/eGFR', isCorrect: true },
              { code: 'B', label: 'Couleur des yeux', isCorrect: false },
              { code: 'C', label: 'Pointure', isCorrect: false },
            ],
          },
        ],
      },
    ];

    const allProfiles = Object.values(PatientProfile);
    const allRelatedTopics = Array.from(topicMap.values());

    const themeBlueprints: Array<{
      theme: QuizTheme;
      title: string;
      titleEn: string;
      description: string;
      descriptionEn: string;
      questionText: string;
      questionTextEn: string;
      questionImageUrl: string;
      questionImageAlt: string;
      questionImageAltEn: string;
      correctLabel: string;
      correctLabelEn: string;
      wrongA: string;
      wrongAEn: string;
      wrongB: string;
      wrongBEn: string;
      mainTopic: typeof ckd;
      supportsDialysisContext: boolean;
    }> = [
      {
        theme: QuizTheme.FOLLOW_UP,
        title: 'Suivi renal quotidien',
        titleEn: 'Daily kidney follow-up',
        description: 'Points cles de suivi regulier pour proteger la fonction renale.',
        descriptionEn: 'Key regular follow-up actions to protect kidney function.',
        questionText: 'Quel reflexe de suivi est prioritaire en insuffisance renale chronique ?',
        questionTextEn: 'Which follow-up habit is a priority in chronic kidney disease?',
        questionImageUrl: '/quiz-images/question-follow-up.svg',
        questionImageAlt: 'Illustration d un suivi medical planifie.',
        questionImageAltEn: 'Illustration of scheduled medical follow-up.',
        correctLabel: 'Controles reguliers et suivi medical planifie',
        correctLabelEn: 'Regular check-ups and planned medical follow-up',
        wrongA: 'Arreter le suivi en absence de symptomes',
        wrongAEn: 'Stop follow-up when there are no symptoms',
        wrongB: 'Attendre uniquement les urgences',
        wrongBEn: 'Wait only for emergencies',
        mainTopic: ckd,
        supportsDialysisContext: true,
      },
      {
        theme: QuizTheme.RISK_FACTORS,
        title: 'Facteurs de risque renaux',
        titleEn: 'Kidney risk factors',
        description: 'Identifier les facteurs qui accelerent la progression renale.',
        descriptionEn: 'Identify factors that accelerate kidney disease progression.',
        questionText: 'Quel facteur augmente clairement le risque de degradation renale ?',
        questionTextEn: 'Which factor clearly increases the risk of kidney deterioration?',
        questionImageUrl: '/quiz-images/question-risk-factors.svg',
        questionImageAlt: 'Illustration des facteurs de risque a surveiller.',
        questionImageAltEn: 'Illustration of risk factors to monitor.',
        correctLabel: 'HTA non controlee et diabete mal equilibre',
        correctLabelEn: 'Uncontrolled hypertension and poorly controlled diabetes',
        wrongA: 'Activite physique adaptee',
        wrongAEn: 'Adapted physical activity',
        wrongB: 'Hydratation selon recommandations',
        wrongBEn: 'Hydration according to recommendations',
        mainTopic: diabetes,
        supportsDialysisContext: false,
      },
      {
        theme: QuizTheme.PREVENTION,
        title: 'Prevention renale',
        titleEn: 'Kidney prevention',
        description: 'Mesures de prevention pour limiter les complications cardio-renales.',
        descriptionEn: 'Prevention measures to reduce cardio-kidney complications.',
        questionText: 'Quelle mesure est la plus utile en prevention renale ?',
        questionTextEn: 'Which measure is most useful for kidney prevention?',
        questionImageUrl: '/quiz-images/question-prevention.svg',
        questionImageAlt: 'Illustration de gestes de prevention renale.',
        questionImageAltEn: 'Illustration of kidney prevention actions.',
        correctLabel: 'Surveillance tensionnelle et hygiene de vie',
        correctLabelEn: 'Blood pressure monitoring and healthy lifestyle',
        wrongA: 'Automedication prolongee',
        wrongAEn: 'Prolonged self-medication',
        wrongB: 'Absence de suivi annuel',
        wrongBEn: 'No annual follow-up',
        mainTopic: htn,
        supportsDialysisContext: false,
      },
      {
        theme: QuizTheme.ADHERENCE,
        title: 'Adherence therapeutique',
        titleEn: 'Therapeutic adherence',
        description: 'Renforcer l adherence aux traitements de nephrologie.',
        descriptionEn: 'Strengthen adherence to nephrology treatments.',
        questionText: 'En cas d oubli de traitement repete, quelle conduite est adaptee ?',
        questionTextEn: 'In case of repeated missed medication, what is the appropriate action?',
        questionImageUrl: '/quiz-images/question-adherence.svg',
        questionImageAlt: 'Illustration d adherence au traitement.',
        questionImageAltEn: 'Illustration of treatment adherence.',
        correctLabel: 'Prevenir l equipe soignante rapidement',
        correctLabelEn: 'Inform the care team quickly',
        wrongA: 'Doubler les doses sans avis',
        wrongAEn: 'Double doses without medical advice',
        wrongB: 'Interrompre le traitement',
        wrongBEn: 'Stop treatment',
        mainTopic: ckd,
        supportsDialysisContext: true,
      },
      {
        theme: QuizTheme.TREATMENT,
        title: 'Traitements nephrologiques',
        titleEn: 'Nephrology treatments',
        description: 'Comprendre les fondamentaux des traitements renaux.',
        descriptionEn: 'Understand the fundamentals of kidney treatments.',
        questionText: 'Quel comportement ameliore la securite du traitement ?',
        questionTextEn: 'Which behavior improves treatment safety?',
        questionImageUrl: '/quiz-images/question-treatment.svg',
        questionImageAlt: 'Illustration de traitement medical securise.',
        questionImageAltEn: 'Illustration of safe medical treatment.',
        correctLabel: 'Respecter prescription et bilans de controle',
        correctLabelEn: 'Follow prescriptions and monitoring tests',
        wrongA: 'Modifier le traitement seul',
        wrongAEn: 'Change treatment on your own',
        wrongB: 'Sauter les controles biologiques',
        wrongBEn: 'Skip laboratory monitoring',
        mainTopic: dialysis,
        supportsDialysisContext: true,
      },
      {
        theme: QuizTheme.NUTRITION,
        title: 'Nutrition en IRC',
        titleEn: 'Nutrition in CKD',
        description: 'Nutrition adaptee pour limiter surcharge et complications.',
        descriptionEn: 'Adapted nutrition to reduce overload and complications.',
        questionText: 'Quel conseil nutritionnel est pertinent en IRC ?',
        questionTextEn: 'Which nutrition advice is relevant in CKD?',
        questionImageUrl: '/quiz-images/question-nutrition.svg',
        questionImageAlt: 'Illustration de nutrition adaptee en insuffisance renale.',
        questionImageAltEn: 'Illustration of adapted nutrition in kidney disease.',
        correctLabel: 'Limiter le sel selon avis medical',
        correctLabelEn: 'Limit salt according to medical advice',
        wrongA: 'Consommer du sel librement',
        wrongAEn: 'Consume salt freely',
        wrongB: 'Supprimer tous les repas',
        wrongBEn: 'Skip all meals',
        mainTopic: nutrition,
        supportsDialysisContext: true,
      },
      {
        theme: QuizTheme.LIFESTYLE,
        title: 'Mode de vie en nephrologie',
        titleEn: 'Lifestyle in nephrology',
        description: 'Habitudes de vie compatibles avec un suivi renal durable.',
        descriptionEn: 'Lifestyle habits compatible with long-term kidney follow-up.',
        questionText: 'Quelle habitude de vie aide le plus le parcours renal ?',
        questionTextEn: 'Which lifestyle habit helps the kidney care journey the most?',
        questionImageUrl: '/quiz-images/question-lifestyle.svg',
        questionImageAlt: 'Illustration d habitudes de vie benefiques.',
        questionImageAltEn: 'Illustration of beneficial lifestyle habits.',
        correctLabel: 'Routine de suivi, activite et repos adaptes',
        correctLabelEn: 'Follow-up routine, adapted activity and rest',
        wrongA: 'Ignorer fatigue et symptomes',
        wrongAEn: 'Ignore fatigue and symptoms',
        wrongB: 'Eviter toute activite utile',
        wrongBEn: 'Avoid any useful activity',
        mainTopic: dialysis,
        supportsDialysisContext: true,
      },
      {
        theme: QuizTheme.COMPLICATIONS,
        title: 'Complications cardio-renales',
        titleEn: 'Cardio-kidney complications',
        description: 'Reconnaitre tot les signes d alerte lies aux complications.',
        descriptionEn: 'Recognize early warning signs linked to complications.',
        questionText: 'Quel signe impose un signalement rapide a l equipe soignante ?',
        questionTextEn: 'Which sign requires rapid reporting to the care team?',
        questionImageUrl: '/quiz-images/question-complications.svg',
        questionImageAlt: 'Illustration de signes d alerte a signaler.',
        questionImageAltEn: 'Illustration of warning signs to report.',
        correctLabel: 'Malaise, dyspnee ou crampes marquees',
        correctLabelEn: 'Malaise, shortness of breath, or marked cramps',
        wrongA: 'Faim passagere',
        wrongAEn: 'Temporary hunger',
        wrongB: 'Soif legere isolee',
        wrongBEn: 'Mild isolated thirst',
        mainTopic: dialysis,
        supportsDialysisContext: true,
      },
    ];

    const buildThemeQuestions = (
      blueprint: (typeof themeBlueprints)[number],
      series: number,
      blueprintIndex: number,
    ) => {
      const sensitiveThemes = new Set<QuizTheme>([
        QuizTheme.ADHERENCE,
        QuizTheme.TREATMENT,
        QuizTheme.COMPLICATIONS,
      ]);
      const scenarioLabels = [
        { fr: 'au domicile', en: 'at home' },
        { fr: 'en consultation', en: 'during a consultation' },
        { fr: 'au moment du traitement', en: 'during treatment' },
        { fr: 'lors du suivi mensuel', en: 'during monthly follow-up' },
        { fr: 'en prevention quotidienne', en: 'in daily prevention' },
        { fr: 'en phase de stabilisation', en: 'during stabilization' },
        { fr: 'en coordination avec l equipe soignante', en: 'in coordination with the care team' },
        { fr: 'lors du controle biologique', en: 'during lab monitoring' },
        { fr: 'en contexte de comorbidite', en: 'in a comorbidity context' },
        { fr: 'dans le parcours educatif', en: 'within the education pathway' },
      ];
      const scenario = scenarioLabels[(series - 1) % scenarioLabels.length];
      const focusLabels = [
        {
          fr: 'apres apparition d un oedeme des membres inferieurs',
          en: 'after lower-limb edema appears',
        },
        {
          fr: 'face a une prise de poids rapide',
          en: 'when facing rapid weight gain',
        },
        {
          fr: 'quand les resultats biologiques evoluent',
          en: 'when lab results are changing',
        },
        {
          fr: 'avant le renouvellement du traitement',
          en: 'before treatment renewal',
        },
        {
          fr: 'durant une semaine de fatigue persistante',
          en: 'during a week of persistent fatigue',
        },
        {
          fr: 'apres un oubli de medicament',
          en: 'after a missed medication dose',
        },
        {
          fr: 'en presence de crampes nocturnes',
          en: 'in the presence of nighttime cramps',
        },
        {
          fr: 'apres un ecart alimentaire notable',
          en: 'after a notable dietary deviation',
        },
        {
          fr: 'devant une tension arterielle elevee',
          en: 'with elevated blood pressure',
        },
        {
          fr: 'lors d un essoufflement inhabituel',
          en: 'during unusual shortness of breath',
        },
      ];
      const focus = focusLabels[(series - 1) % focusLabels.length];
      const moduleChoiceText = `Dans le module ${blueprint.title.toLowerCase()}, quel choix est le plus adapte ${scenario.fr} ?`;
      const moduleChoiceTextEn = `In the ${blueprint.titleEn.toLowerCase()} module, which choice is most appropriate ${scenario.en}?`;
      const imageInstruction = 'Choisissez l image qui montre la conduite la plus adaptee.';
      const imageInstructionEn = 'Choose the image that shows the most appropriate action.';
      const isSensitive = sensitiveThemes.has(blueprint.theme);
      const wrongALower = blueprint.wrongA.toLowerCase();
      const wrongALowerEn = blueprint.wrongAEn.toLowerCase();
      const baseQuestionFr = blueprint.questionText.replace(/\?+\s*$/, '').trim();
      const baseQuestionEn = blueprint.questionTextEn.replace(/\?+\s*$/, '').trim();
      const contextualQuestionFr = `${baseQuestionFr} ${focus.fr} ?`;
      const contextualQuestionEn = `${baseQuestionEn} ${focus.en}?`;
      const visualVariant = ((blueprintIndex + series - 1) % 4) + 1;
      const contextualQuestionImageByFocus: Record<
        string,
        { url: string; alt: string; altEn: string }
      > = {
        'quand les resultats biologiques evoluent': {
          url: '/quiz-images/question-lab-monitoring.svg',
          alt: 'Illustration de suivi des resultats biologiques.',
          altEn: 'Illustration of laboratory result monitoring.',
        },
      };
      const contextualQuestionImage =
        contextualQuestionImageByFocus[focus.fr] ??
        ({
          url: blueprint.questionImageUrl,
          alt: blueprint.questionImageAlt,
          altEn: blueprint.questionImageAltEn,
        } as const);
      const isAlertSymptomContext = [
        'en presence de crampes nocturnes',
        'lors d un essoufflement inhabituel',
        'apres apparition d un oedeme des membres inferieurs',
      ].includes(focus.fr);
      const isFatigueContext = focus.fr === 'durant une semaine de fatigue persistante';
      const safeOptionImageUrl = isFatigueContext
        ? '/quiz-images/option-fatigue-good.svg'
        : isAlertSymptomContext
          ? '/quiz-images/option-alert-good.svg'
          : `/quiz-images/option-safe-action-v${visualVariant}.svg`;
      const riskOptionImageUrl = isFatigueContext
        ? '/quiz-images/option-fatigue-risky.svg'
        : isAlertSymptomContext
          ? '/quiz-images/option-alert-risky.svg'
          : `/quiz-images/option-risk-action-v${visualVariant}.svg`;
      const noFollowupImageUrl = isFatigueContext
        ? '/quiz-images/option-fatigue-intermediate.svg'
        : isAlertSymptomContext
          ? '/quiz-images/option-alert-intermediate.svg'
          : `/quiz-images/option-no-followup-v${visualVariant}.svg`;

      return [
        {
          linkId: 'q1',
          text: `${contextualQuestionFr} (Quiz ${series})`,
          textI18n: { en: `${contextualQuestionEn} (Quiz ${series})` },
          promptText: isSensitive ? contextualQuestionFr : null,
          promptTextI18n: isSensitive ? { en: contextualQuestionEn } : {},
          audioText: `${contextualQuestionFr} ${imageInstruction}`,
          audioTextI18n: { en: `${contextualQuestionEn} ${imageInstructionEn}` },
          imageUrl: contextualQuestionImage.url,
          imageAlt: contextualQuestionImage.alt,
          imageAltI18n: { en: contextualQuestionImage.altEn },
          isSensitiveMedical: isSensitive,
          type: QuizQuestionType.SINGLE_CHOICE,
          weight: 1,
          options: [
            {
              code: 'A',
              label: blueprint.correctLabel,
              labelI18n: { en: blueprint.correctLabelEn },
              isCorrect: true,
              imageUrl: safeOptionImageUrl,
              imageAlt: `Illustration: ${blueprint.correctLabel}`,
              imageAltI18n: { en: `Illustration: ${blueprint.correctLabelEn}` },
            },
            {
              code: 'B',
              label: blueprint.wrongA,
              labelI18n: { en: blueprint.wrongAEn },
              isCorrect: false,
              imageUrl: riskOptionImageUrl,
              imageAlt: `Illustration: ${blueprint.wrongA}`,
              imageAltI18n: { en: `Illustration: ${blueprint.wrongAEn}` },
            },
            {
              code: 'C',
              label: blueprint.wrongB,
              labelI18n: { en: blueprint.wrongBEn },
              isCorrect: false,
              imageUrl: noFollowupImageUrl,
              imageAlt: `Illustration: ${blueprint.wrongB}`,
              imageAltI18n: { en: `Illustration: ${blueprint.wrongBEn}` },
            },
          ],
        },
        {
          linkId: 'q2',
          text: `${moduleChoiceText} (Quiz ${series})`,
          textI18n: { en: `${moduleChoiceTextEn} (Quiz ${series})` },
          promptText: moduleChoiceText,
          promptTextI18n: { en: moduleChoiceTextEn },
          audioText: moduleChoiceText,
          audioTextI18n: { en: moduleChoiceTextEn },
          imageUrl: null,
          imageAlt: null,
          isSensitiveMedical: isSensitive,
          type: QuizQuestionType.SINGLE_CHOICE,
          weight: 1,
          options: [
            {
              code: 'A',
              label: blueprint.correctLabel,
              labelI18n: { en: blueprint.correctLabelEn },
              isCorrect: true,
            },
            {
              code: 'B',
              label: blueprint.wrongA,
              labelI18n: { en: blueprint.wrongAEn },
              isCorrect: false,
            },
            {
              code: 'C',
              label: 'Attendre sans suivi structure',
              labelI18n: { en: 'Wait without structured follow-up' },
              isCorrect: false,
            },
          ],
        },
        {
          linkId: 'q3',
          text: `Vrai ou faux: ${wrongALower} est une bonne pratique. (Quiz ${series})`,
          textI18n: {
            en: `True or false: ${wrongALowerEn} is good practice. (Quiz ${series})`,
          },
          promptText: `Vrai ou faux: ${wrongALower} est une bonne pratique.`,
          promptTextI18n: { en: `True or false: ${wrongALowerEn} is good practice.` },
          audioText: null,
          audioTextI18n: {},
          imageUrl: null,
          imageAlt: null,
          imageAltI18n: {},
          isSensitiveMedical: isSensitive,
          type: QuizQuestionType.BOOLEAN,
          weight: 1,
          options: [
            { code: 'TRUE', label: 'Vrai', labelI18n: { en: 'True' }, isCorrect: false },
            { code: 'FALSE', label: 'Faux', labelI18n: { en: 'False' }, isCorrect: true },
          ],
        },
      ];
    };

    const generatedThemeTemplates = themeBlueprints.flatMap((blueprint, blueprintIndex) =>
      Array.from({ length: 10 }, (_, index) => {
        const series = index + 1;
        return {
          title: `${blueprint.title} - Serie ${series}`,
          titleI18n: { en: `${blueprint.titleEn} - Series ${series}` },
          slug: `theme-${blueprint.theme.toLowerCase()}-serie-${series}`,
          description: `${blueprint.description} (serie ${series}).`,
          descriptionI18n: { en: `${blueprint.descriptionEn} (series ${series}).` },
          status: QuizStatus.PUBLISHED,
          level:
            series <= 4
              ? QuizLevel.BEGINNER
              : series <= 7
                ? QuizLevel.INTERMEDIATE
                : QuizLevel.ADVANCED,
          themes: [blueprint.theme],
          targetProfiles: allProfiles,
          supportsDialysisContext: blueprint.supportsDialysisContext,
          mainTopic: blueprint.mainTopic,
          relatedTopics: allRelatedTopics,
          questions: buildThemeQuestions(blueprint, series, blueprintIndex),
        };
      }),
    );

    const templates = [...baseTemplates, ...generatedThemeTemplates];

    const existing = await this.quizRepository.find({ select: { slug: true } });
    const existingSlugs = new Set(existing.map((quiz) => quiz.slug));

    const quizzesToCreate = templates
      .filter((template) => !existingSlugs.has(template.slug))
      .map((template) => this.quizRepository.create(template));

    if (quizzesToCreate.length > 0) {
      await this.quizRepository.save(quizzesToCreate);
      this.logger.log(`${quizzesToCreate.length} quiz templates seeded`);
    }

    const generatedSlugs = generatedThemeTemplates.map((template) => template.slug);
    const generatedTemplateBySlug = new Map(
      generatedThemeTemplates.map((template) => [template.slug, template] as const),
    );
    const generatedSeriesQuizzes = await this.quizRepository.find({
      where: { slug: In(generatedSlugs) },
      relations: { questions: true },
    });

    const generatedQuizzesToUpdate: QuizEntity[] = [];
    const generatedQuestionsToCreate: QuizQuestionEntity[] = [];
    const generatedQuestionsToUpdate: QuizQuestionEntity[] = [];
    generatedSeriesQuizzes.forEach((generatedQuiz) => {
      const template = generatedTemplateBySlug.get(generatedQuiz.slug);
      if (!template) {
        return;
      }

      const hasQuizChanges =
        generatedQuiz.title !== template.title ||
        generatedQuiz.description !== (template.description ?? null) ||
        JSON.stringify(generatedQuiz.titleI18n ?? {}) !==
          JSON.stringify(template.titleI18n ?? {}) ||
        JSON.stringify(generatedQuiz.descriptionI18n ?? {}) !==
          JSON.stringify(template.descriptionI18n ?? {});

      if (hasQuizChanges) {
        generatedQuiz.title = template.title;
        generatedQuiz.description = template.description ?? null;
        generatedQuiz.titleI18n = template.titleI18n ?? {};
        generatedQuiz.descriptionI18n = template.descriptionI18n ?? {};
        generatedQuizzesToUpdate.push(generatedQuiz);
      }

      const existingByLinkId = new Map(
        generatedQuiz.questions.map((question) => [question.linkId, question] as const),
      );
      template.questions.forEach((questionTemplate) => {
        const existingQuestion = existingByLinkId.get(questionTemplate.linkId);
        if (existingQuestion) {
          const hasChanges =
            existingQuestion.text !== questionTemplate.text ||
            existingQuestion.promptText !== (questionTemplate.promptText ?? null) ||
            existingQuestion.audioText !== (questionTemplate.audioText ?? null) ||
            existingQuestion.imageUrl !== (questionTemplate.imageUrl ?? null) ||
            existingQuestion.imageAlt !== (questionTemplate.imageAlt ?? null) ||
            JSON.stringify(existingQuestion.textI18n ?? {}) !==
              JSON.stringify(questionTemplate.textI18n ?? {}) ||
            JSON.stringify(existingQuestion.promptTextI18n ?? {}) !==
              JSON.stringify(questionTemplate.promptTextI18n ?? {}) ||
            JSON.stringify(existingQuestion.audioTextI18n ?? {}) !==
              JSON.stringify(questionTemplate.audioTextI18n ?? {}) ||
            JSON.stringify(existingQuestion.imageAltI18n ?? {}) !==
              JSON.stringify(questionTemplate.imageAltI18n ?? {}) ||
            existingQuestion.type !== questionTemplate.type ||
            Number(existingQuestion.weight) !== Number(questionTemplate.weight) ||
            Boolean(existingQuestion.isSensitiveMedical) !==
              Boolean(questionTemplate.isSensitiveMedical) ||
            JSON.stringify(existingQuestion.options ?? []) !==
              JSON.stringify(questionTemplate.options ?? []);

          if (!hasChanges) {
            return;
          }

          existingQuestion.text = questionTemplate.text;
          existingQuestion.promptText = questionTemplate.promptText ?? null;
          existingQuestion.audioText = questionTemplate.audioText ?? null;
          existingQuestion.imageUrl = questionTemplate.imageUrl ?? null;
          existingQuestion.imageAlt = questionTemplate.imageAlt ?? null;
          existingQuestion.textI18n = questionTemplate.textI18n ?? {};
          existingQuestion.promptTextI18n = questionTemplate.promptTextI18n ?? {};
          existingQuestion.audioTextI18n = questionTemplate.audioTextI18n ?? {};
          existingQuestion.imageAltI18n = questionTemplate.imageAltI18n ?? {};
          existingQuestion.type = questionTemplate.type;
          existingQuestion.weight = questionTemplate.weight;
          existingQuestion.options = questionTemplate.options;
          existingQuestion.isSensitiveMedical = Boolean(questionTemplate.isSensitiveMedical);
          generatedQuestionsToUpdate.push(existingQuestion);
          return;
        }

        generatedQuestionsToCreate.push(
          this.questionRepository.create({
            ...questionTemplate,
            quiz: generatedQuiz,
          }),
        );
      });
    });

    if (generatedQuizzesToUpdate.length > 0) {
      await this.quizRepository.save(generatedQuizzesToUpdate);
      this.logger.log(
        `Theme-series quiz metadata updated with ${generatedQuizzesToUpdate.length} localization entries`,
      );
    }

    if (generatedQuestionsToCreate.length > 0) {
      await this.questionRepository.save(generatedQuestionsToCreate);
      this.logger.log(
        `Theme-series question banks upgraded with ${generatedQuestionsToCreate.length} additional questions`,
      );
    }

    if (generatedQuestionsToUpdate.length > 0) {
      await this.questionRepository.save(generatedQuestionsToUpdate);
      this.logger.log(
        `Theme-series question banks updated with ${generatedQuestionsToUpdate.length} enriched questions`,
      );
    }

    const renalTemplate = templates.find((template) => template.slug === 'module-renal-quiz-principal');
    if (!renalTemplate) {
      return;
    }

    const renalQuiz = await this.quizRepository.findOne({
      where: { slug: renalTemplate.slug },
      relations: { questions: true },
    });

    if (!renalQuiz) {
      return;
    }

    if (renalQuiz.questions.length >= 30) {
      return;
    }

    await this.questionRepository
      .createQueryBuilder()
      .delete()
      .from(QuizQuestionEntity)
      .where('quiz_id = :quizId', { quizId: renalQuiz.id })
      .execute();

    const rebuiltQuestions = renalTemplate.questions.map((question) =>
      this.questionRepository.create({
        ...question,
        quiz: renalQuiz,
      }),
    );

    await this.questionRepository.save(rebuiltQuestions);
    this.logger.log('Renal primary quiz upgraded to 30-question bank');
  }
}
