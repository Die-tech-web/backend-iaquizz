import { Injectable } from '@nestjs/common';
import { IcdService } from '../icd/icd.service';
import { QuizService } from '../quiz/quiz.service';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { FilterQuizDto } from '../quiz/dto/filter-quiz.dto';
import { MedicalTopicKey } from '../common/enums/medical-topic.enum';
import { PatientService } from '../patient/patient.service';
import { RecommendationScoringService } from './recommendation/recommendation-scoring.service';

@Injectable()
export class AnalysisService {
  constructor(
    private readonly icdService: IcdService,
    private readonly quizService: QuizService,
    private readonly patientService: PatientService,
    private readonly recommendationScoringService: RecommendationScoringService,
  ) {}

  async getCorrelationGraph(mainTopic: MedicalTopicKey) {
    const relations = await this.icdService.findCorrelations(mainTopic);

    return {
      mainTopic,
      links: relations.map((relation) => ({
        target: relation.correlatedTopic.key,
        targetLabel: relation.correlatedTopic.label,
        priority: relation.priority,
        strength: Number(relation.strength),
        type: relation.type,
        rationale: relation.rationale,
      })),
    };
  }

  async recommendForPatient(patientId: string, query: RecommendationQueryDto) {
    const filter: FilterQuizDto = {
      patientId,
      mainDisease: query.dominantDisease,
    };

    const quizzes = await this.quizService.filter(filter);

    return quizzes.map((quiz) => ({
      quizId: quiz.id,
      title: quiz.title,
      level: quiz.level,
      mainTopic: quiz.mainTopic.key,
      relatedTopics: quiz.relatedTopics.map((topic) => topic.key),
      scoreHint: this.computeRecommendationScoreHint(quiz),
    }));
  }

  async recommendForPatientV2(patientId: string, query: RecommendationQueryDto) {
    const patient = await this.patientService.findById(patientId);
    const filter: FilterQuizDto = {
      patientId,
      mainDisease: query.dominantDisease,
    };
    const quizzes = await this.quizService.filter(filter);
    const limit = query.limit ?? 5;

    const ranked = quizzes
      .map((quiz) => ({
        quiz,
        recommendation: this.recommendationScoringService.scoreQuiz(quiz, {
          dominantDisease: query.dominantDisease,
          patientProfile: patient.profile,
          patientConditionKeys: patient.conditions.map((topic) => topic.key),
        }),
      }))
      .sort(
        (left, right) =>
          right.recommendation.relevanceScore - left.recommendation.relevanceScore ||
          left.quiz.title.localeCompare(right.quiz.title),
      )
      .slice(0, limit);

    return {
      patientId,
      patientProfile: patient.profile,
      dominantDisease: query.dominantDisease ?? null,
      generatedAt: new Date().toISOString(),
      totalCandidates: quizzes.length,
      recommendations: ranked.map(({ quiz, recommendation }) => ({
        quizId: quiz.id,
        title: quiz.title,
        level: quiz.level,
        mainTopic: quiz.mainTopic.key,
        relatedTopics: quiz.relatedTopics.map((topic) => topic.key),
        targetProfiles: quiz.targetProfiles,
        relevanceScore: recommendation.relevanceScore,
        scoreHint: recommendation.scoreHint,
        reasons: recommendation.reasons,
        matchedTopics: recommendation.matchedTopics,
      })),
    };
  }

  private computeRecommendationScoreHint(quiz: { relatedTopics: { key: MedicalTopicKey }[] }) {
    const hasCkdContext = quiz.relatedTopics.some(
      (topic) =>
        topic.key === MedicalTopicKey.CHRONIC_KIDNEY_DISEASE ||
        topic.key === MedicalTopicKey.DIALYSIS,
    );

    return hasCkdContext ? 0.85 : 0.65;
  }
}
