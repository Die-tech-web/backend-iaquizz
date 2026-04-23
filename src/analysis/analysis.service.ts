import { Injectable } from '@nestjs/common';
import { IcdService } from '../icd/icd.service';
import { QuizService } from '../quiz/quiz.service';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { FilterQuizDto } from '../quiz/dto/filter-quiz.dto';
import { MedicalTopicKey } from '../common/enums/medical-topic.enum';

@Injectable()
export class AnalysisService {
  constructor(
    private readonly icdService: IcdService,
    private readonly quizService: QuizService,
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

  private computeRecommendationScoreHint(quiz: { relatedTopics: { key: MedicalTopicKey }[] }) {
    const hasCkdContext = quiz.relatedTopics.some(
      (topic) =>
        topic.key === MedicalTopicKey.CHRONIC_KIDNEY_DISEASE ||
        topic.key === MedicalTopicKey.DIALYSIS,
    );

    return hasCkdContext ? 0.85 : 0.65;
  }
}
