import { Injectable } from '@nestjs/common';
import {
  QUIZ_THEME_PROGRESSION_ORDER,
  QuizLevel,
  QuizTheme,
} from '../common/enums/quiz.enum';
import { PatientProgressionEntity } from './entities/patient-progression.entity';

export type ProgressToast = {
  type: 'success' | 'warning' | 'info';
  message: string;
  duration: number;
};

export type SubmissionProgressResult = {
  passed: boolean;
  scoreOnTen: number;
  currentLevel: QuizLevel;
  currentModule: QuizTheme;
  moduleCompleted: boolean;
  levelCompleted: boolean;
  nextLevel: QuizLevel | null;
  toast: ProgressToast;
};

@Injectable()
export class ProgressionService {
  static readonly PASSING_SCORE_ON_TEN = 8;
  static readonly TOAST_DURATION_MS = 5000;

  getModuleOrder(): QuizTheme[] {
    return [...QUIZ_THEME_PROGRESSION_ORDER];
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

  ensureDefaults(progression: PatientProgressionEntity): PatientProgressionEntity {
    progression.currentLevel = progression.currentLevel ?? QuizLevel.BEGINNER;
    progression.currentModule = progression.currentModule ?? QUIZ_THEME_PROGRESSION_ORDER[0];
    progression.validatedModulesByLevel = progression.validatedModulesByLevel ?? {};
    progression.moduleScoresByLevel = progression.moduleScoresByLevel ?? {};
    progression.playedQuizIdsByLevelModule = progression.playedQuizIdsByLevelModule ?? {};
    progression.nextLevel = this.getNextLevel(progression.currentLevel);
    progression.requiredPerfectScoresForNextLevel = 0;
    progression.perfectScoresAtCurrentLevel = 0;
    return progression;
  }

  registerPlayedQuiz(
    progression: PatientProgressionEntity,
    level: QuizLevel,
    module: QuizTheme,
    quizId: string,
  ) {
    const currentByLevel = progression.playedQuizIdsByLevelModule[level] ?? {};
    const currentForModule = currentByLevel[module] ?? [];
    if (!currentForModule.includes(quizId)) {
      currentForModule.push(quizId);
    }
    currentByLevel[module] = currentForModule.slice(-20);
    progression.playedQuizIdsByLevelModule[level] = currentByLevel;
  }

  applySubmissionResult(params: {
    progression: PatientProgressionEntity;
    levelAtAttempt: QuizLevel;
    moduleAtAttempt: QuizTheme;
    scoreOnTen: number;
  }): SubmissionProgressResult {
    const progression = this.ensureDefaults(params.progression);
    const level = params.levelAtAttempt;
    const module = params.moduleAtAttempt;
    const scoreOnTen = Number(params.scoreOnTen.toFixed(2));
    const passed = scoreOnTen >= ProgressionService.PASSING_SCORE_ON_TEN;
    const validatedByLevel = progression.validatedModulesByLevel[level] ?? [];
    const moduleScoresForLevel = progression.moduleScoresByLevel[level] ?? {};
    const previousScore = Number(moduleScoresForLevel[module] ?? 0);
    moduleScoresForLevel[module] = Number(Math.max(previousScore, scoreOnTen).toFixed(2));
    progression.moduleScoresByLevel[level] = moduleScoresForLevel;

    let moduleCompleted = false;
    let levelCompleted = false;
    let nextLevel: QuizLevel | null = null;
    let toast: ProgressToast;

    if (!passed) {
      progression.progressionPercentage = Number(
        ((validatedByLevel.length / QUIZ_THEME_PROGRESSION_ORDER.length) * 100).toFixed(2),
      );
      toast = {
        type: 'warning',
        message:
          'Score insuffisant. Vous devez obtenir au moins 8/10 pour passer au module suivant.',
        duration: ProgressionService.TOAST_DURATION_MS,
      };
      return {
        passed,
        scoreOnTen,
        currentLevel: progression.currentLevel,
        currentModule: progression.currentModule,
        moduleCompleted,
        levelCompleted,
        nextLevel,
        toast,
      };
    }

    if (!validatedByLevel.includes(module)) {
      validatedByLevel.push(module);
      progression.validatedModulesByLevel[level] = validatedByLevel;
    }
    moduleCompleted = true;

    const allModulesCompleted = QUIZ_THEME_PROGRESSION_ORDER.every((theme) =>
      validatedByLevel.includes(theme),
    );

    if (!allModulesCompleted) {
      const currentIndex = QUIZ_THEME_PROGRESSION_ORDER.indexOf(module);
      const nextModule = QUIZ_THEME_PROGRESSION_ORDER[currentIndex + 1];
      progression.currentModule = nextModule ?? progression.currentModule;
      progression.progressionPercentage = Number(
        ((validatedByLevel.length / QUIZ_THEME_PROGRESSION_ORDER.length) * 100).toFixed(2),
      );
      toast = {
        type: 'success',
        message: 'Félicitations 🎉 Vous passez au module suivant.',
        duration: ProgressionService.TOAST_DURATION_MS,
      };

      return {
        passed,
        scoreOnTen,
        currentLevel: progression.currentLevel,
        currentModule: progression.currentModule,
        moduleCompleted,
        levelCompleted,
        nextLevel,
        toast,
      };
    }

    levelCompleted = true;
    const promotedLevel = this.getNextLevel(level);
    progression.progressionPercentage = 100;

    if (promotedLevel) {
      progression.currentLevel = promotedLevel;
      progression.currentModule = QUIZ_THEME_PROGRESSION_ORDER[0];
      progression.nextLevel = this.getNextLevel(promotedLevel);
      progression.progressionPercentage = 0;
      progression.lastLevelUpAt = new Date();
      nextLevel = promotedLevel;
      toast = {
        type: 'success',
        message:
          promotedLevel === QuizLevel.INTERMEDIATE
            ? 'Félicitations 🎉 Vous pouvez passer au niveau Intermédiaire.'
            : 'Félicitations 🎉 Vous pouvez passer au niveau Avancé.',
        duration: ProgressionService.TOAST_DURATION_MS,
      };
    } else {
      progression.nextLevel = null;
      toast = {
        type: 'success',
        message: 'Félicitations 🎉 Vous avez terminé tous les modules du niveau Avancé.',
        duration: ProgressionService.TOAST_DURATION_MS,
      };
    }

    return {
      passed,
      scoreOnTen,
      currentLevel: progression.currentLevel,
      currentModule: progression.currentModule,
      moduleCompleted,
      levelCompleted,
      nextLevel,
      toast,
    };
  }

  buildProgressRationale(progression: PatientProgressionEntity): string {
    const validated = progression.validatedModulesByLevel?.[progression.currentLevel] ?? [];
    return `${validated.length}/${QUIZ_THEME_PROGRESSION_ORDER.length} modules validés au niveau ${progression.currentLevel}.`;
  }
}

