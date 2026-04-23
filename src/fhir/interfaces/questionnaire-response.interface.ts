export interface FhirQuestionnaireResponseItemAnswer {
  valueCoding?: { code: string; display?: string };
  valueBoolean?: boolean;
}

export interface FhirQuestionnaireResponseItem {
  linkId: string;
  answer: FhirQuestionnaireResponseItemAnswer[];
}

export interface FhirQuestionnaireResponse {
  resourceType: 'QuestionnaireResponse';
  id: string;
  status: 'in-progress' | 'completed';
  authored: string;
  questionnaire: string;
  subject: { reference: string };
  item: FhirQuestionnaireResponseItem[];
}
