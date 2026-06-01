import { QuizAttemptStatus, QuizLevel, QuizTheme } from '../common/enums/quiz.enum';
import { QuizAttemptEntity } from './entities/quiz-attempt.entity';
import { QuizEntity } from './entities/quiz.entity';
import { QuizRandomizationService } from './quiz-randomization.service';

const buildQuiz = (id: string): QuizEntity =>
  ({
    id,
    title: id,
    titleI18n: {},
    slug: id,
    description: null,
    descriptionI18n: {},
    status: 'PUBLISHED',
    level: QuizLevel.BEGINNER,
    themes: [QuizTheme.RISK_FACTORS],
    targetProfiles: [],
    supportsDialysisContext: false,
    mainTopic: {} as QuizEntity['mainTopic'],
    relatedTopics: [],
    questions: [],
    attempts: [],
  }) as QuizEntity;

const buildAttempt = (quiz: QuizEntity, date: string): QuizAttemptEntity =>
  ({
    id: `${quiz.id}-${date}`,
    patient: {} as QuizAttemptEntity['patient'],
    quiz,
    status: QuizAttemptStatus.COMPLETED,
    levelAtAttempt: QuizLevel.BEGINNER,
    moduleAtAttempt: QuizTheme.RISK_FACTORS,
    language: 'FR',
    score: 8,
    maxScore: 10,
    startedAt: new Date(date),
    completedAt: new Date(date),
    isSavedByPatient: false,
    savedAt: null,
    answers: [],
  }) as QuizAttemptEntity;

describe('QuizRandomizationService', () => {
  const service = new QuizRandomizationService();

  it('prioritizes unseen quiz variants when available', () => {
    const quizA = buildQuiz('A');
    const quizB = buildQuiz('B');
    const quizC = buildQuiz('C');

    const ordered = service.orderCandidatesForPatientModule({
      candidates: [quizA, quizB, quizC],
      attempts: [buildAttempt(quizA, '2026-04-01T10:00:00.000Z')],
    });

    expect(ordered[0].id).not.toBe('A');
  });

  it('allows replay after variants are exhausted and favors least recently seen', () => {
    const quizA = buildQuiz('A');
    const quizB = buildQuiz('B');
    const quizC = buildQuiz('C');

    const ordered = service.orderCandidatesForPatientModule({
      candidates: [quizA, quizB, quizC],
      attempts: [
        buildAttempt(quizA, '2026-04-03T10:00:00.000Z'),
        buildAttempt(quizB, '2026-04-02T10:00:00.000Z'),
        buildAttempt(quizC, '2026-04-01T10:00:00.000Z'),
      ],
    });

    expect(ordered.length).toBe(3);
    expect(ordered[0].id).toBe('C');
  });

  it('limits variant pool to 3 quizzes for same level and module', () => {
    const quizA = buildQuiz('A');
    const quizB = buildQuiz('B');
    const quizC = buildQuiz('C');
    const quizD = buildQuiz('D');

    const ordered = service.orderCandidatesForPatientModule({
      candidates: [quizA, quizB, quizC, quizD],
      attempts: [buildAttempt(quizA, '2026-04-01T10:00:00.000Z')],
    });

    expect(ordered.length).toBeLessThanOrEqual(3);
  });
});
