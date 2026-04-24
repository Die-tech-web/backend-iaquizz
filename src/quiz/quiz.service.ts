import {
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
import { PatientService } from '../patient/patient.service';
import { IcdService } from '../icd/icd.service';
import {
  MedicalTopicKey,
  MedicalTopicType,
} from '../common/enums/medical-topic.enum';
import {
  QuizAttemptStatus,
  QuizLevel,
  QuizQuestionType,
  QuizStatus,
  QuizTheme,
} from '../common/enums/quiz.enum';
import { PatientProfile } from '../common/enums/patient.enum';

@Injectable()
export class QuizService implements OnModuleInit {
  private readonly logger = new Logger(QuizService.name);
  private static readonly MIN_QUIZZES_PER_THEME = 10;
  private static readonly QUESTIONS_PER_ATTEMPT = 10;

  constructor(
    @InjectRepository(QuizEntity)
    private readonly quizRepository: Repository<QuizEntity>,
    @InjectRepository(QuizQuestionEntity)
    private readonly questionRepository: Repository<QuizQuestionEntity>,
    @InjectRepository(QuizAttemptEntity)
    private readonly attemptRepository: Repository<QuizAttemptEntity>,
    @InjectRepository(QuizAnswerEntity)
    private readonly answerRepository: Repository<QuizAnswerEntity>,
    private readonly icdService: IcdService,
    private readonly patientService: PatientService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedQuizTemplates();
    await this.logThemeCoverageHealth();
  }

  async filter(dto: FilterQuizDto): Promise<QuizEntity[]> {
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

    if (dto.level) {
      qb.andWhere('quiz.level = :level', { level: dto.level });
    }

    if (dto.themes?.length) {
      qb.andWhere('quiz.themes && :themes', { themes: dto.themes });
    }

    if (dto.patientProfile) {
      qb.andWhere('quiz.targetProfiles && :profiles', { profiles: [dto.patientProfile] });
    }

    const quizzes = await qb.getMany();

    if (!dto.mainDisease && !dto.correlatedDiseases?.length && !dto.patientId) {
      return this.applyQuestionSelection(quizzes);
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
    return this.orderQuizzesByPatientHistory(selected, dto.patientId);
  }

  async findOne(quizId: string): Promise<QuizEntity> {
    const quiz = await this.quizRepository.findOne({
      where: { id: quizId },
      relations: { questions: true, mainTopic: true, relatedTopics: true },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz ${quizId} not found`);
    }

    return quiz;
  }

  async submit(dto: SubmitQuizDto): Promise<QuizAttemptEntity> {
    const patient = await this.patientService.findById(dto.patientId);
    const quiz = await this.findOne(dto.quizId);

    const questions = await this.questionRepository.find({
      where: { id: In(dto.answers.map((answer) => answer.questionId)) },
    });
    const questionMap = new Map(questions.map((question) => [question.id, question]));

    const attempt = await this.attemptRepository.save(
      this.attemptRepository.create({
        patient,
        quiz,
        status: QuizAttemptStatus.IN_PROGRESS,
      }),
    );

    let totalScore = 0;
    for (const submittedAnswer of dto.answers) {
      const question = questionMap.get(submittedAnswer.questionId);
      if (!question) {
        continue;
      }

      const points = this.scoreAnswer(question, submittedAnswer.value);
      totalScore += points;

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
    attempt.score = totalScore;
    attempt.completedAt = new Date();

    return this.attemptRepository.save(attempt);
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
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getQuestionSignature(question: Pick<QuizQuestionEntity, 'text' | 'options'>): string {
    const text = this.normalizeQuestionText(question.text);
    const options = (question.options ?? [])
      .map((option) => this.normalizeQuestionText(option.label))
      .sort()
      .join('|');

    return `${text}::${options}`;
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
    candidates: Array<{ question: QuizQuestionEntity; signature: string }>,
    seenSignatures: Set<string>,
  ) {
    const ordered = this.shuffle(candidates);

    const appendPass = (includeSeen: boolean) => {
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

        selectedQuestions.push(candidate.question);
        selectedSignatures.add(candidate.signature);
      }
    };

    appendPass(false);
    appendPass(true);
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

    this.appendQuestions(selectedQuestions, selectedSignatures, ownCandidates, seenSignatures);

    if (selectedQuestions.length < QuizService.QUESTIONS_PER_ATTEMPT) {
      this.appendQuestions(
        selectedQuestions,
        selectedSignatures,
        sameThemeSameLevel,
        seenSignatures,
      );
    }

    if (selectedQuestions.length < QuizService.QUESTIONS_PER_ATTEMPT) {
      this.appendQuestions(
        selectedQuestions,
        selectedSignatures,
        sameThemeAnyLevel,
        seenSignatures,
      );
    }

    if (selectedQuestions.length < QuizService.QUESTIONS_PER_ATTEMPT) {
      this.appendQuestions(selectedQuestions, selectedSignatures, allCandidates, seenSignatures);
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
      const quizIds = quizzes.map((quiz) => quiz.id);
      const seenAnswers = await this.answerRepository
        .createQueryBuilder('answer')
        .innerJoin('answer.attempt', 'attempt')
        .innerJoinAndSelect('answer.question', 'question')
        .innerJoinAndSelect('question.quiz', 'quiz')
        .where('attempt.patient_id = :patientId', { patientId })
        .andWhere('attempt.status = :status', { status: QuizAttemptStatus.COMPLETED })
        .andWhere('quiz.id IN (:...quizIds)', { quizIds })
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
      description: string;
      questionText: string;
      correctLabel: string;
      wrongA: string;
      wrongB: string;
      mainTopic: typeof ckd;
      supportsDialysisContext: boolean;
    }> = [
      {
        theme: QuizTheme.FOLLOW_UP,
        title: 'Suivi renal quotidien',
        description: 'Points cles de suivi regulier pour proteger la fonction renale.',
        questionText: 'Quel reflexe de suivi est prioritaire en insuffisance renale chronique ?',
        correctLabel: 'Controles reguliers et suivi medical planifie',
        wrongA: 'Arreter le suivi en absence de symptomes',
        wrongB: 'Attendre uniquement les urgences',
        mainTopic: ckd,
        supportsDialysisContext: true,
      },
      {
        theme: QuizTheme.RISK_FACTORS,
        title: 'Facteurs de risque renaux',
        description: 'Identifier les facteurs qui accelerent la progression renale.',
        questionText: 'Quel facteur augmente clairement le risque de degradation renale ?',
        correctLabel: 'HTA non controlee et diabete mal equilibre',
        wrongA: 'Activite physique adaptee',
        wrongB: 'Hydratation selon recommandations',
        mainTopic: diabetes,
        supportsDialysisContext: false,
      },
      {
        theme: QuizTheme.PREVENTION,
        title: 'Prevention renale',
        description: 'Mesures de prevention pour limiter les complications cardio-renales.',
        questionText: 'Quelle mesure est la plus utile en prevention renale ?',
        correctLabel: 'Surveillance tensionnelle et hygiene de vie',
        wrongA: 'Automedication prolongee',
        wrongB: 'Absence de suivi annuel',
        mainTopic: htn,
        supportsDialysisContext: false,
      },
      {
        theme: QuizTheme.ADHERENCE,
        title: 'Adherence therapeutique',
        description: 'Renforcer l adherence aux traitements de nephrologie.',
        questionText: 'En cas d oubli de traitement repete, quelle conduite est adaptee ?',
        correctLabel: 'Prevenir l equipe soignante rapidement',
        wrongA: 'Doubler les doses sans avis',
        wrongB: 'Interrompre le traitement',
        mainTopic: ckd,
        supportsDialysisContext: true,
      },
      {
        theme: QuizTheme.TREATMENT,
        title: 'Traitements nephrologiques',
        description: 'Comprendre les fondamentaux des traitements renaux.',
        questionText: 'Quel comportement ameliore la securite du traitement ?',
        correctLabel: 'Respecter prescription et bilans de controle',
        wrongA: 'Modifier le traitement seul',
        wrongB: 'Sauter les controles biologiques',
        mainTopic: dialysis,
        supportsDialysisContext: true,
      },
      {
        theme: QuizTheme.NUTRITION,
        title: 'Nutrition en IRC',
        description: 'Nutrition adaptee pour limiter surcharge et complications.',
        questionText: 'Quel conseil nutritionnel est pertinent en IRC ?',
        correctLabel: 'Limiter le sel selon avis medical',
        wrongA: 'Consommer du sel librement',
        wrongB: 'Supprimer tous les repas',
        mainTopic: nutrition,
        supportsDialysisContext: true,
      },
      {
        theme: QuizTheme.LIFESTYLE,
        title: 'Mode de vie en nephrologie',
        description: 'Habitudes de vie compatibles avec un suivi renal durable.',
        questionText: 'Quelle habitude de vie aide le plus le parcours renal ?',
        correctLabel: 'Routine de suivi, activite et repos adaptes',
        wrongA: 'Ignorer fatigue et symptomes',
        wrongB: 'Eviter toute activite utile',
        mainTopic: dialysis,
        supportsDialysisContext: true,
      },
      {
        theme: QuizTheme.COMPLICATIONS,
        title: 'Complications cardio-renales',
        description: 'Reconnaitre tot les signes d alerte lies aux complications.',
        questionText: 'Quel signe impose un signalement rapide a l equipe soignante ?',
        correctLabel: 'Malaise, dyspnee ou crampes marquees',
        wrongA: 'Faim passagere',
        wrongB: 'Soif legere isolee',
        mainTopic: dialysis,
        supportsDialysisContext: true,
      },
    ];

    const generatedThemeTemplates = themeBlueprints.flatMap((blueprint) =>
      Array.from({ length: 10 }, (_, index) => {
        const series = index + 1;
        return {
          title: `${blueprint.title} - Serie ${series}`,
          slug: `theme-${blueprint.theme.toLowerCase()}-serie-${series}`,
          description: `${blueprint.description} (serie ${series}).`,
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
          questions: [
            {
              linkId: 'q1',
              text: `${blueprint.questionText} (Quiz ${series})`,
              type: QuizQuestionType.SINGLE_CHOICE,
              weight: 1,
              options: [
                { code: 'A', label: blueprint.correctLabel, isCorrect: true },
                { code: 'B', label: blueprint.wrongA, isCorrect: false },
                { code: 'C', label: blueprint.wrongB, isCorrect: false },
              ],
            },
          ],
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
