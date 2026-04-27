import { Injectable } from '@nestjs/common';
import {
  DEFAULT_PATIENT_LANGUAGE,
  PatientLanguage,
  resolvePatientLanguage,
} from '../common/enums/language.enum';
import { QuizEntity } from './entities/quiz.entity';
import {
  QuizQuestionEntity,
  QuizQuestionOption,
} from './entities/quiz-question.entity';

type LocalizedTextMap = Partial<Record<PatientLanguage, string>>;

@Injectable()
export class QuizLocalizationService {
  localizeQuizzes(quizzes: QuizEntity[], lang?: PatientLanguage): QuizEntity[] {
    return quizzes.map((quiz) => this.localizeQuiz(quiz, lang));
  }

  localizeQuiz(quiz: QuizEntity, lang?: PatientLanguage): QuizEntity {
    const resolvedLanguage = resolvePatientLanguage(lang);

    return {
      ...quiz,
      title: this.pickLocalizedRequiredText(quiz.title, quiz.titleI18n, resolvedLanguage),
      description: this.pickLocalizedText(quiz.description, quiz.descriptionI18n, resolvedLanguage),
      questions: (quiz.questions ?? []).map((question) =>
        this.localizeQuestion(question, resolvedLanguage),
      ),
    };
  }

  private localizeQuestion(question: QuizQuestionEntity, lang: PatientLanguage): QuizQuestionEntity {
    return {
      ...question,
      text: this.pickLocalizedRequiredText(question.text, question.textI18n, lang),
      promptText: this.pickLocalizedText(question.promptText, question.promptTextI18n, lang),
      audioText: this.pickLocalizedText(question.audioText, question.audioTextI18n, lang),
      imageAlt: this.pickLocalizedText(question.imageAlt, question.imageAltI18n, lang),
      options: (question.options ?? []).map((option) => this.localizeOption(option, lang)),
    };
  }

  private localizeOption(option: QuizQuestionOption, lang: PatientLanguage): QuizQuestionOption {
    return {
      ...option,
      label: this.pickLocalizedText(option.label, option.labelI18n, lang) ?? option.label,
      imageAlt: this.pickLocalizedText(option.imageAlt, option.imageAltI18n, lang),
    };
  }

  private pickLocalizedText(
    baseValue: string | null | undefined,
    i18n?: LocalizedTextMap,
    lang?: PatientLanguage,
  ): string | null {
    const resolvedLanguage = resolvePatientLanguage(lang);
    const localizedValue = i18n?.[resolvedLanguage];
    if (localizedValue && localizedValue.trim()) {
      return localizedValue;
    }

    if (resolvedLanguage !== DEFAULT_PATIENT_LANGUAGE) {
      const fallbackValue = i18n?.[DEFAULT_PATIENT_LANGUAGE];
      if (fallbackValue && fallbackValue.trim()) {
        return fallbackValue;
      }
    }

    return baseValue ?? null;
  }

  private pickLocalizedRequiredText(
    baseValue: string,
    i18n?: LocalizedTextMap,
    lang?: PatientLanguage,
  ): string {
    return this.pickLocalizedText(baseValue, i18n, lang) ?? baseValue;
  }
}
