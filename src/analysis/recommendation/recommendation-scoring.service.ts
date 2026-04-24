import { Injectable } from '@nestjs/common';
import { MedicalTopicKey } from '../../common/enums/medical-topic.enum';
import { PatientProfile } from '../../common/enums/patient.enum';
import { QuizLevel } from '../../common/enums/quiz.enum';
import { QuizEntity } from '../../quiz/entities/quiz.entity';

export type RecommendationScoringContext = {
  dominantDisease?: MedicalTopicKey;
  patientProfile: PatientProfile;
  patientConditionKeys: MedicalTopicKey[];
};

export type RecommendationScore = {
  relevanceScore: number;
  scoreHint: number;
  reasons: string[];
  matchedTopics: MedicalTopicKey[];
};

@Injectable()
export class RecommendationScoringService {
  private static readonly BASE_SCORE = 0.35;
  private static readonly MAX_CONDITION_BONUS = 0.28;

  private static readonly PROFILE_LEVEL_PREFERENCES: Record<PatientProfile, QuizLevel[]> = {
    [PatientProfile.STANDARD]: [QuizLevel.BEGINNER, QuizLevel.INTERMEDIATE],
    [PatientProfile.CHRONIC]: [QuizLevel.INTERMEDIATE, QuizLevel.BEGINNER],
    [PatientProfile.DIALYSIS]: [QuizLevel.BEGINNER, QuizLevel.INTERMEDIATE],
    [PatientProfile.COMORBID]: [QuizLevel.INTERMEDIATE, QuizLevel.ADVANCED],
    [PatientProfile.AT_RISK]: [QuizLevel.BEGINNER, QuizLevel.INTERMEDIATE],
  };

  scoreQuiz(quiz: QuizEntity, context: RecommendationScoringContext): RecommendationScore {
    let score = RecommendationScoringService.BASE_SCORE;
    const reasons: string[] = [];
    const matchedTopics = new Set<MedicalTopicKey>();
    const relatedKeys = new Set(quiz.relatedTopics.map((topic) => topic.key));

    score += this.scoreDominantDisease(
      quiz,
      relatedKeys,
      context.dominantDisease,
      reasons,
      matchedTopics,
    );
    score += this.scorePatientConditions(
      quiz,
      relatedKeys,
      context.patientConditionKeys,
      reasons,
      matchedTopics,
    );
    score += this.scoreProfileCompatibility(quiz, context.patientProfile, reasons);
    score += this.scoreLevelCompatibility(quiz.level, context.patientProfile, reasons);
    score += this.scoreDialysisContext(quiz, context.patientProfile, reasons);

    if (reasons.length === 0) {
      reasons.push('Quiz general utile pour l education therapeutique.');
    }

    const relevanceScore = Math.min(1, Number(score.toFixed(3)));
    const scoreHint = relevanceScore >= 0.8 ? 0.85 : relevanceScore >= 0.65 ? 0.75 : 0.65;

    return {
      relevanceScore,
      scoreHint,
      reasons,
      matchedTopics: Array.from(matchedTopics),
    };
  }

  private scoreDominantDisease(
    quiz: QuizEntity,
    relatedKeys: Set<MedicalTopicKey>,
    dominantDisease: MedicalTopicKey | undefined,
    reasons: string[],
    matchedTopics: Set<MedicalTopicKey>,
  ): number {
    if (!dominantDisease) {
      return 0;
    }

    if (quiz.mainTopic.key === dominantDisease) {
      reasons.push('Le quiz traite directement la maladie dominante demandee.');
      matchedTopics.add(dominantDisease);
      return 0.24;
    }

    if (relatedKeys.has(dominantDisease)) {
      reasons.push('Le quiz couvre une maladie correlee a la maladie dominante.');
      matchedTopics.add(dominantDisease);
      return 0.12;
    }

    return 0;
  }

  private scorePatientConditions(
    quiz: QuizEntity,
    relatedKeys: Set<MedicalTopicKey>,
    patientConditionKeys: MedicalTopicKey[],
    reasons: string[],
    matchedTopics: Set<MedicalTopicKey>,
  ): number {
    let bonus = 0;
    const uniqueConditions = Array.from(new Set(patientConditionKeys));

    for (const condition of uniqueConditions) {
      if (quiz.mainTopic.key === condition) {
        bonus += 0.12;
        matchedTopics.add(condition);
        reasons.push(`Le quiz cible une condition declaree: ${condition}.`);
        continue;
      }

      if (relatedKeys.has(condition)) {
        bonus += 0.07;
        matchedTopics.add(condition);
        reasons.push(`Le quiz inclut une condition associee: ${condition}.`);
      }
    }

    return Math.min(bonus, RecommendationScoringService.MAX_CONDITION_BONUS);
  }

  private scoreProfileCompatibility(
    quiz: QuizEntity,
    patientProfile: PatientProfile,
    reasons: string[],
  ): number {
    if (!quiz.targetProfiles.includes(patientProfile)) {
      return 0;
    }

    reasons.push(`Le contenu est adapte au profil patient ${patientProfile}.`);
    return 0.14;
  }

  private scoreLevelCompatibility(
    level: QuizLevel,
    patientProfile: PatientProfile,
    reasons: string[],
  ): number {
    const preferredLevels =
      RecommendationScoringService.PROFILE_LEVEL_PREFERENCES[patientProfile] ?? [];
    if (!preferredLevels.includes(level)) {
      return 0;
    }

    reasons.push(`Le niveau ${level} est coherent avec le profil d apprentissage du patient.`);
    return 0.06;
  }

  private scoreDialysisContext(
    quiz: QuizEntity,
    patientProfile: PatientProfile,
    reasons: string[],
  ): number {
    if (patientProfile !== PatientProfile.DIALYSIS || !quiz.supportsDialysisContext) {
      return 0;
    }

    reasons.push('Le quiz couvre explicitement un contexte de dialyse.');
    return 0.08;
  }
}
