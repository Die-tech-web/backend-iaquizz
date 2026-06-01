import { Injectable } from '@nestjs/common';
import { QuizEntity } from './entities/quiz.entity';
import { QuizAttemptEntity } from './entities/quiz-attempt.entity';

@Injectable()
export class QuizRandomizationService {
  private static readonly MAX_VARIANTS_PER_LEVEL_MODULE = 3;

  private shuffle<T>(items: T[]) {
    const values = [...items];
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }

  orderCandidatesForPatientModule(params: {
    candidates: QuizEntity[];
    attempts: QuizAttemptEntity[];
  }): QuizEntity[] {
    const { candidates, attempts } = params;
    if (candidates.length <= 1) {
      return candidates;
    }

    const candidateIdSet = new Set(candidates.map((quiz) => quiz.id));
    const latestByQuiz = new Map<string, number>();
    const playedDistinct: string[] = [];
    const playedSet = new Set<string>();

    attempts.forEach((attempt) => {
      const quizId = attempt.quiz?.id;
      if (!quizId || !candidateIdSet.has(quizId)) {
        return;
      }

      const timestamp = new Date(attempt.completedAt ?? attempt.startedAt).getTime();
      const previous = latestByQuiz.get(quizId);
      if (!previous || timestamp > previous) {
        latestByQuiz.set(quizId, timestamp);
      }

      if (!playedSet.has(quizId)) {
        playedSet.add(quizId);
        playedDistinct.push(quizId);
      }
    });

    const unplayed = candidates.filter((quiz) => !playedSet.has(quiz.id));
    const selectedVariantIds = new Set<string>();
    playedDistinct
      .slice(0, QuizRandomizationService.MAX_VARIANTS_PER_LEVEL_MODULE)
      .forEach((quizId) => selectedVariantIds.add(quizId));

    if (selectedVariantIds.size < QuizRandomizationService.MAX_VARIANTS_PER_LEVEL_MODULE) {
      this.shuffle(unplayed).forEach((quiz) => {
        if (selectedVariantIds.size >= QuizRandomizationService.MAX_VARIANTS_PER_LEVEL_MODULE) {
          return;
        }
        selectedVariantIds.add(quiz.id);
      });
    }

    const variantLimitedCandidates =
      selectedVariantIds.size > 0
        ? candidates.filter((quiz) => selectedVariantIds.has(quiz.id))
        : candidates;
    const variantLimitedSet = new Set(variantLimitedCandidates.map((quiz) => quiz.id));
    const variantUnplayed = variantLimitedCandidates.filter((quiz) => !playedSet.has(quiz.id));

    if (variantUnplayed.length > 0) {
      const untouchedFirst = this.shuffle(variantUnplayed);
      const playedLater = variantLimitedCandidates
        .filter((quiz) => playedSet.has(quiz.id))
        .sort((left, right) => (latestByQuiz.get(left.id) ?? 0) - (latestByQuiz.get(right.id) ?? 0));
      return [...untouchedFirst, ...playedLater];
    }

    const attemptsOnVariantPool = playedDistinct.filter((quizId) => variantLimitedSet.has(quizId));
    const hasConsumedThreeVariants =
      attemptsOnVariantPool.length >=
      Math.min(
        QuizRandomizationService.MAX_VARIANTS_PER_LEVEL_MODULE,
        variantLimitedCandidates.length,
      );

    if (!hasConsumedThreeVariants) {
      return this.shuffle(variantLimitedCandidates);
    }

    return this.shuffle([...variantLimitedCandidates]).sort(
      (left, right) => (latestByQuiz.get(left.id) ?? 0) - (latestByQuiz.get(right.id) ?? 0),
    );
  }
}
