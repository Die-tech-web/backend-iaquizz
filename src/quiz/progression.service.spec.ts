import { QuizLevel, QuizTheme } from '../common/enums/quiz.enum';
import { PatientProgressionEntity } from './entities/patient-progression.entity';
import { ProgressionService } from './progression.service';

const createProgression = (overrides: Partial<PatientProgressionEntity> = {}) => {
  const base: PatientProgressionEntity = {
    id: 'progression-id',
    patient: {} as PatientProgressionEntity['patient'],
    currentLevel: QuizLevel.BEGINNER,
    currentModule: QuizTheme.RISK_FACTORS,
    nextLevel: QuizLevel.INTERMEDIATE,
    validatedModulesByLevel: {},
    moduleScoresByLevel: {},
    playedQuizIdsByLevelModule: {},
    perfectScoresAtCurrentLevel: 0,
    requiredPerfectScoresForNextLevel: 0,
    progressionPercentage: 0,
    totalCompletedAttempts: 0,
    totalPerfectScores: 0,
    lastLevelUpAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  return { ...base, ...overrides };
};

describe('ProgressionService', () => {
  const service = new ProgressionService();

  it('keeps patient in same module when score is below 8/10', () => {
    const progression = createProgression();

    const result = service.applySubmissionResult({
      progression,
      levelAtAttempt: QuizLevel.BEGINNER,
      moduleAtAttempt: QuizTheme.RISK_FACTORS,
      scoreOnTen: 7.5,
    });

    expect(result.passed).toBe(false);
    expect(result.currentLevel).toBe(QuizLevel.BEGINNER);
    expect(result.currentModule).toBe(QuizTheme.RISK_FACTORS);
    expect(result.moduleCompleted).toBe(false);
  });

  it('moves to next module when score is >= 8/10', () => {
    const progression = createProgression();

    const result = service.applySubmissionResult({
      progression,
      levelAtAttempt: QuizLevel.BEGINNER,
      moduleAtAttempt: QuizTheme.RISK_FACTORS,
      scoreOnTen: 8,
    });

    expect(result.passed).toBe(true);
    expect(result.currentLevel).toBe(QuizLevel.BEGINNER);
    expect(result.currentModule).toBe(QuizTheme.FOLLOW_UP);
    expect(result.moduleCompleted).toBe(true);
    expect(result.levelCompleted).toBe(false);
  });

  it('promotes to next level when all modules in level are validated', () => {
    const progression = createProgression({
      currentLevel: QuizLevel.BEGINNER,
      currentModule: QuizTheme.LIFESTYLE,
      validatedModulesByLevel: {
        [QuizLevel.BEGINNER]: [
          QuizTheme.RISK_FACTORS,
          QuizTheme.FOLLOW_UP,
          QuizTheme.TREATMENT,
          QuizTheme.NUTRITION,
          QuizTheme.PREVENTION,
          QuizTheme.ADHERENCE,
          QuizTheme.COMPLICATIONS,
        ],
      },
    });

    const result = service.applySubmissionResult({
      progression,
      levelAtAttempt: QuizLevel.BEGINNER,
      moduleAtAttempt: QuizTheme.LIFESTYLE,
      scoreOnTen: 9,
    });

    expect(result.levelCompleted).toBe(true);
    expect(result.currentLevel).toBe(QuizLevel.INTERMEDIATE);
    expect(result.currentModule).toBe(QuizTheme.RISK_FACTORS);
    expect(result.nextLevel).toBe(QuizLevel.INTERMEDIATE);
  });
});

