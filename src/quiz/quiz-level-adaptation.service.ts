import { Injectable } from '@nestjs/common';
import { QuizLevel } from '../common/enums/quiz.enum';

export type CompletedQuizAttemptSnapshot = {
  levelAtAttempt?: QuizLevel;
  level?: QuizLevel;
  score: number | null;
  maxScore: number | null;
  completedAt: Date;
};

export type AdaptiveLevelDecision = {
  currentLevel: QuizLevel;
  recommendedLevel: QuizLevel;
  nextLevel: QuizLevel | null;
  progressionPercentage: number;
  perfectScoresAtCurrentLevel: number;
  requiredPerfectScoresForNextLevel: number;
  remainingPerfectScoresToUnlock: number;
  completedAttempts: number;
  perfectScoresByLevel: Record<QuizLevel, number>;
  overallSuccessRate: number;
  nextObjective: string | null;
  rationale: string;
};

@Injectable()
export class QuizLevelAdaptationService {
  private static readonly REQUIRED_PERFECT_SCORES: Record<QuizLevel, number> = {
    [QuizLevel.BEGINNER]: 3,
    [QuizLevel.INTERMEDIATE]: 5,
    [QuizLevel.ADVANCED]: 0,
  };

  decide(attempts: CompletedQuizAttemptSnapshot[], currentLevelHint?: QuizLevel): AdaptiveLevelDecision {
    const rankedAttempts = this.toRankedAttempts(attempts);
    const perfectScoresByLevel = this.countPerfectScoresByLevel(rankedAttempts);
    const resolvedLevel = currentLevelHint ?? this.resolveCurrentLevel(perfectScoresByLevel);
    const nextLevel = this.getNextLevel(resolvedLevel);
    const requiredPerfectScoresForNextLevel = this.getRequiredPerfectScores(resolvedLevel);
    const perfectScoresAtCurrentLevel = perfectScoresByLevel[resolvedLevel];
    const remainingPerfectScoresToUnlock = nextLevel
      ? Math.max(requiredPerfectScoresForNextLevel - perfectScoresAtCurrentLevel, 0)
      : 0;
    const progressionPercentage = nextLevel
      ? Number(
          (
            (Math.min(perfectScoresAtCurrentLevel, requiredPerfectScoresForNextLevel) /
              Math.max(requiredPerfectScoresForNextLevel, 1)) *
            100
          ).toFixed(2),
        )
      : 100;

    const overallSuccessRate = Number(
      this.average(rankedAttempts.map((attempt) => attempt.successRate)).toFixed(3),
    );

    return {
      currentLevel: resolvedLevel,
      recommendedLevel: resolvedLevel,
      nextLevel,
      progressionPercentage,
      perfectScoresAtCurrentLevel,
      requiredPerfectScoresForNextLevel,
      remainingPerfectScoresToUnlock,
      completedAttempts: rankedAttempts.length,
      perfectScoresByLevel,
      overallSuccessRate,
      nextObjective: this.buildNextObjective(nextLevel, remainingPerfectScoresToUnlock),
      rationale: this.buildRationale(resolvedLevel, perfectScoresByLevel),
    };
  }

  getNextLevel(level: QuizLevel): QuizLevel | null {
    if (level === QuizLevel.BEGINNER) {
      return QuizLevel.INTERMEDIATE;
    }
    if (level === QuizLevel.INTERMEDIATE) {
      return QuizLevel.ADVANCED;
    }
    return null;
  }

  getRequiredPerfectScores(level: QuizLevel): number {
    return QuizLevelAdaptationService.REQUIRED_PERFECT_SCORES[level];
  }

  buildLevelUpMessage(fromLevel: QuizLevel, toLevel: QuizLevel): string {
    return `Bravo ! Vous avez validé le niveau ${this.toLevelLabel(
      fromLevel,
    )}. Vous passez maintenant au niveau ${this.toLevelLabel(toLevel)}.`;
  }

  private toLevelLabel(level: QuizLevel): string {
    if (level === QuizLevel.BEGINNER) {
      return 'Débutant';
    }
    if (level === QuizLevel.INTERMEDIATE) {
      return 'Intermédiaire';
    }
    return 'Avancé';
  }

  private resolveCurrentLevel(perfectScoresByLevel: Record<QuizLevel, number>): QuizLevel {
    const beginnerUnlocked =
      perfectScoresByLevel[QuizLevel.BEGINNER] >=
      QuizLevelAdaptationService.REQUIRED_PERFECT_SCORES[QuizLevel.BEGINNER];
    const intermediateUnlocked =
      beginnerUnlocked &&
      perfectScoresByLevel[QuizLevel.INTERMEDIATE] >=
        QuizLevelAdaptationService.REQUIRED_PERFECT_SCORES[QuizLevel.INTERMEDIATE];

    if (intermediateUnlocked) {
      return QuizLevel.ADVANCED;
    }
    if (beginnerUnlocked) {
      return QuizLevel.INTERMEDIATE;
    }
    return QuizLevel.BEGINNER;
  }

  private countPerfectScoresByLevel(
    attempts: Array<{ level: QuizLevel; successRate: number }>,
  ): Record<QuizLevel, number> {
    const base = {
      [QuizLevel.BEGINNER]: 0,
      [QuizLevel.INTERMEDIATE]: 0,
      [QuizLevel.ADVANCED]: 0,
    };

    attempts.forEach((attempt) => {
      if (attempt.successRate >= 0.999) {
        base[attempt.level] += 1;
      }
    });

    return base;
  }

  private buildNextObjective(nextLevel: QuizLevel | null, remainingPerfectScoresToUnlock: number) {
    if (!nextLevel) {
      return null;
    }

    return `Encore ${remainingPerfectScoresToUnlock} quiz parfait(s) à 10/10 pour débloquer le niveau ${this.toLevelLabel(
      nextLevel,
    )}.`;
  }

  private buildRationale(level: QuizLevel, perfectScoresByLevel: Record<QuizLevel, number>) {
    if (level === QuizLevel.BEGINNER) {
      return `${perfectScoresByLevel[QuizLevel.BEGINNER]}/3 quiz parfait(s) validés au niveau Débutant.`;
    }

    if (level === QuizLevel.INTERMEDIATE) {
      return `${perfectScoresByLevel[QuizLevel.INTERMEDIATE]}/5 quiz parfait(s) validés au niveau Intermédiaire.`;
    }

    return 'Niveau Avancé validé.';
  }

  private toRankedAttempts(attempts: CompletedQuizAttemptSnapshot[]) {
    return attempts
      .map((attempt) => {
        const score = Number(attempt.score ?? 0);
        const maxScore = Number(attempt.maxScore ?? 10);
        const safeMaxScore = maxScore > 0 ? maxScore : 10;
        const level = attempt.levelAtAttempt ?? attempt.level ?? QuizLevel.BEGINNER;

        return {
          level,
          successRate: this.clamp(score / safeMaxScore),
          completedAt: attempt.completedAt,
        };
      })
      .sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime());
  }

  private average(values: number[]): number {
    if (!values.length) {
      return 0;
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
  }

  private clamp(value: number): number {
    if (!Number.isFinite(value) || value < 0) {
      return 0;
    }
    if (value > 1) {
      return 1;
    }
    return value;
  }
}
