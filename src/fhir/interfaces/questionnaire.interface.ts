import { FhirCodeableConcept } from '../../common/types/fhir.type';

export interface FhirQuestionnaireItem {
  linkId: string;
  text: string;
  type: 'choice' | 'boolean';
  answerOption?: Array<{ valueCoding: { code: string; display: string } }>;
}

export interface FhirQuestionnaire {
  resourceType: 'Questionnaire';
  id: string;
  title: string;
  status: 'draft' | 'active' | 'retired';
  subjectType: ['Patient'];
  code: FhirCodeableConcept[];
  item: FhirQuestionnaireItem[];
}
