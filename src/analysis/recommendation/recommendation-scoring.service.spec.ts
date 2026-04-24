import { MedicalTopicKey } from '../../common/enums/medical-topic.enum';
import { PatientProfile } from '../../common/enums/patient.enum';
import { QuizLevel } from '../../common/enums/quiz.enum';
import { QuizEntity } from '../../quiz/entities/quiz.entity';
import {
  RecommendationScoringService,
  RecommendationScoringContext,
} from './recommendation-scoring.service';

describe('RecommendationScoringService', () => {
  const service = new RecommendationScoringService();

  const makeQuiz = (partial: Partial<QuizEntity>): QuizEntity =>
    ({
      id: 'quiz-id',
      title: 'Quiz title',
      slug: 'quiz-slug',
      description: null,
      status: 'PUBLISHED',
      level: QuizLevel.INTERMEDIATE,
      themes: [],
      targetProfiles: [],
      supportsDialysisContext: false,
      mainTopic: { key: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE },
      relatedTopics: [],
      questions: [],
      attempts: [],
      ...partial,
    }) as QuizEntity;

  it('scores a strongly matching dialysis quiz with high relevance', () => {
    const quiz = makeQuiz({
      level: QuizLevel.BEGINNER,
      targetProfiles: [PatientProfile.DIALYSIS],
      supportsDialysisContext: true,
      mainTopic: { key: MedicalTopicKey.DIALYSIS } as QuizEntity['mainTopic'],
      relatedTopics: [{ key: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE }] as QuizEntity['relatedTopics'],
    });

    const context: RecommendationScoringContext = {
      dominantDisease: MedicalTopicKey.DIALYSIS,
      patientProfile: PatientProfile.DIALYSIS,
      patientConditionKeys: [MedicalTopicKey.CHRONIC_KIDNEY_DISEASE],
    };

    const result = service.scoreQuiz(quiz, context);

    expect(result.relevanceScore).toBeGreaterThan(0.8);
    expect(result.matchedTopics).toEqual(
      expect.arrayContaining([MedicalTopicKey.DIALYSIS, MedicalTopicKey.CHRONIC_KIDNEY_DISEASE]),
    );
    expect(result.reasons.some((reason) => reason.includes('dialyse'))).toBe(true);
  });

  it('adds a default explanation when no scoring signal is matched', () => {
    const quiz = makeQuiz({
      level: QuizLevel.ADVANCED,
      targetProfiles: [PatientProfile.COMORBID],
      supportsDialysisContext: false,
      mainTopic: { key: MedicalTopicKey.MALARIA } as QuizEntity['mainTopic'],
      relatedTopics: [{ key: MedicalTopicKey.TUBERCULOSIS }] as QuizEntity['relatedTopics'],
    });

    const context: RecommendationScoringContext = {
      dominantDisease: MedicalTopicKey.DIALYSIS,
      patientProfile: PatientProfile.STANDARD,
      patientConditionKeys: [MedicalTopicKey.NUTRITION],
    };

    const result = service.scoreQuiz(quiz, context);

    expect(result.relevanceScore).toBe(0.35);
    expect(result.reasons).toEqual([
      'Quiz general utile pour l education therapeutique.',
    ]);
    expect(result.matchedTopics).toHaveLength(0);
  });

  it('caps score to 1.0 when multiple strong signals are present', () => {
    const quiz = makeQuiz({
      level: QuizLevel.INTERMEDIATE,
      targetProfiles: [PatientProfile.COMORBID],
      supportsDialysisContext: false,
      mainTopic: { key: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE } as QuizEntity['mainTopic'],
      relatedTopics: [
        { key: MedicalTopicKey.DIABETES },
        { key: MedicalTopicKey.HYPERTENSION },
        { key: MedicalTopicKey.NUTRITION },
      ] as QuizEntity['relatedTopics'],
    });

    const context: RecommendationScoringContext = {
      dominantDisease: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
      patientProfile: PatientProfile.COMORBID,
      patientConditionKeys: [
        MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
        MedicalTopicKey.DIABETES,
        MedicalTopicKey.HYPERTENSION,
        MedicalTopicKey.NUTRITION,
      ],
    };

    const result = service.scoreQuiz(quiz, context);

    expect(result.relevanceScore).toBe(1);
  });
});
