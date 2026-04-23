import { CorrelationType } from '../../common/enums/correlation.enum';
import { MedicalTopicKey, MedicalTopicType } from '../../common/enums/medical-topic.enum';

export const MEDICAL_TOPICS_SEED = [
  {
    key: MedicalTopicKey.MALARIA,
    label: 'Paludisme',
    type: MedicalTopicType.DISEASE,
    icd11Code: '1A40',
    description: 'Maladie infectieuse parasitaire transmise par moustiques.',
  },
  {
    key: MedicalTopicKey.TUBERCULOSIS,
    label: 'Tuberculose',
    type: MedicalTopicType.DISEASE,
    icd11Code: '1B10',
    description: 'Maladie infectieuse due au complexe Mycobacterium tuberculosis.',
  },
  {
    key: MedicalTopicKey.DIABETES,
    label: 'Diabete',
    type: MedicalTopicType.DISEASE,
    icd11Code: '5A11',
    description: 'Trouble metabolique chronique avec hyperglycemie persistante.',
  },
  {
    key: MedicalTopicKey.HYPERTENSION,
    label: 'Hypertension arterielle',
    type: MedicalTopicType.DISEASE,
    icd11Code: 'BA00',
    description: 'Elevation chronique de la pression arterielle.',
  },
  {
    key: MedicalTopicKey.SICKLE_CELL_DISEASE,
    label: 'Drepanocytose',
    type: MedicalTopicType.DISEASE,
    icd11Code: '3A50',
    description: 'Hemoglobinopathie hereditaire chronique.',
  },
  {
    key: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
    label: 'Insuffisance renale chronique',
    type: MedicalTopicType.DISEASE,
    icd11Code: 'GB61',
    description: 'Perte progressive et irreversible de la fonction renale.',
  },
  {
    key: MedicalTopicKey.DIALYSIS,
    label: 'Dialyse',
    type: MedicalTopicType.THEME,
    icd11Code: null,
    description: 'Contexte de prise en charge de l insuffisance renale severe.',
  },
  {
    key: MedicalTopicKey.VACCINATION,
    label: 'Vaccination',
    type: MedicalTopicType.THEME,
    icd11Code: 'QA16',
    description: 'Prevention par immunisation selon profil patient.',
  },
  {
    key: MedicalTopicKey.NUTRITION,
    label: 'Nutrition',
    type: MedicalTopicType.THEME,
    icd11Code: 'ME10',
    description: 'Habitudes alimentaires et adaptation nutritionnelle.',
  },
] as const;

export const CORRELATIONS_SEED = [
  {
    primary: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
    correlated: MedicalTopicKey.DIABETES,
    type: CorrelationType.COMORBIDITY,
    priority: 10,
    strength: 0.95,
    rationale: 'Le diabete est une cause majeure d insuffisance renale chronique.',
  },
  {
    primary: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
    correlated: MedicalTopicKey.HYPERTENSION,
    type: CorrelationType.RISK_FACTOR,
    priority: 9,
    strength: 0.9,
    rationale: 'L hypertension accelere la progression de l insuffisance renale.',
  },
  {
    primary: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
    correlated: MedicalTopicKey.DIALYSIS,
    type: CorrelationType.CARE_CONTEXT,
    priority: 10,
    strength: 0.98,
    rationale: 'La dialyse est un contexte de prise en charge d IRC avancee.',
  },
  {
    primary: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
    correlated: MedicalTopicKey.NUTRITION,
    type: CorrelationType.LIFESTYLE_LINK,
    priority: 8,
    strength: 0.85,
    rationale: 'Le regime nutritionnel influence les complications renales.',
  },
  {
    primary: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
    correlated: MedicalTopicKey.VACCINATION,
    type: CorrelationType.PREVENTIVE_LINK,
    priority: 6,
    strength: 0.6,
    rationale: 'La prevention infectieuse est importante chez patients fragiles.',
  },
] as const;
