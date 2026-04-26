import { QuizLevel } from '../common/enums/quiz.enum';
import {
  CompletedQuizAttemptSnapshot,
  QuizLevelAdaptationService,
} from './quiz-level-adaptation.service';

describe('QuizLevelAdaptationService', () => {
  const service = new QuizLevelAdaptationService();

  const buildAttempt = (
    level: QuizLevel,
    score: number,
    dateIso: string,
  ): CompletedQuizAttemptSnapshot => ({
    levelAtAttempt: level,
    score,
    maxScore: 10,
    completedAt: new Date(dateIso),
  });

  it('starts at BEGINNER when no history exists', () => {
    const decision = service.decide([]);

    expect(decision.currentLevel).toBe(QuizLevel.BEGINNER);
    expect(decision.nextLevel).toBe(QuizLevel.INTERMEDIATE);
    expect(decision.requiredPerfectScoresForNextLevel).toBe(3);
    expect(decision.remainingPerfectScoresToUnlock).toBe(3);
  });

  it('promotes BEGINNER to INTERMEDIATE after 3 perfect scores', () => {
    const decision = service.decide([
      buildAttempt(QuizLevel.BEGINNER, 10, '2026-04-20T10:00:00.000Z'),
      buildAttempt(QuizLevel.BEGINNER, 10, '2026-04-19T10:00:00.000Z'),
      buildAttempt(QuizLevel.BEGINNER, 10, '2026-04-18T10:00:00.000Z'),
    ]);

    expect(decision.currentLevel).toBe(QuizLevel.INTERMEDIATE);
    expect(decision.nextLevel).toBe(QuizLevel.ADVANCED);
    expect(decision.requiredPerfectScoresForNextLevel).toBe(5);
    expect(decision.remainingPerfectScoresToUnlock).toBe(5);
  });

  it('does not promote INTERMEDIATE to ADVANCED before 5 perfect scores', () => {
    const decision = service.decide([
      buildAttempt(QuizLevel.BEGINNER, 10, '2026-04-20T10:00:00.000Z'),
      buildAttempt(QuizLevel.BEGINNER, 10, '2026-04-19T10:00:00.000Z'),
      buildAttempt(QuizLevel.BEGINNER, 10, '2026-04-18T10:00:00.000Z'),
      buildAttempt(QuizLevel.INTERMEDIATE, 10, '2026-04-17T10:00:00.000Z'),
      buildAttempt(QuizLevel.INTERMEDIATE, 10, '2026-04-16T10:00:00.000Z'),
      buildAttempt(QuizLevel.INTERMEDIATE, 10, '2026-04-15T10:00:00.000Z'),
      buildAttempt(QuizLevel.INTERMEDIATE, 9, '2026-04-14T10:00:00.000Z'),
    ]);

    expect(decision.currentLevel).toBe(QuizLevel.INTERMEDIATE);
    expect(decision.nextLevel).toBe(QuizLevel.ADVANCED);
    expect(decision.perfectScoresAtCurrentLevel).toBe(3);
    expect(decision.remainingPerfectScoresToUnlock).toBe(2);
  });

  it('promotes INTERMEDIATE to ADVANCED after 5 perfect scores', () => {
    const decision = service.decide([
      buildAttempt(QuizLevel.BEGINNER, 10, '2026-04-20T10:00:00.000Z'),
      buildAttempt(QuizLevel.BEGINNER, 10, '2026-04-19T10:00:00.000Z'),
      buildAttempt(QuizLevel.BEGINNER, 10, '2026-04-18T10:00:00.000Z'),
      buildAttempt(QuizLevel.INTERMEDIATE, 10, '2026-04-17T10:00:00.000Z'),
      buildAttempt(QuizLevel.INTERMEDIATE, 10, '2026-04-16T10:00:00.000Z'),
      buildAttempt(QuizLevel.INTERMEDIATE, 10, '2026-04-15T10:00:00.000Z'),
      buildAttempt(QuizLevel.INTERMEDIATE, 10, '2026-04-14T10:00:00.000Z'),
      buildAttempt(QuizLevel.INTERMEDIATE, 10, '2026-04-13T10:00:00.000Z'),
    ]);

    expect(decision.currentLevel).toBe(QuizLevel.ADVANCED);
    expect(decision.nextLevel).toBeNull();
    expect(decision.progressionPercentage).toBe(100);
  });
});
