export enum PatientLanguage {
  FR = 'fr',
  EN = 'en',
  WO = 'wo',
}

export const DEFAULT_PATIENT_LANGUAGE = PatientLanguage.FR;

export const SUPPORTED_PATIENT_LANGUAGES = [
  PatientLanguage.FR,
  PatientLanguage.EN,
  PatientLanguage.WO,
] as const;

export const resolvePatientLanguage = (value?: string | null): PatientLanguage => {
  if (!value) {
    return DEFAULT_PATIENT_LANGUAGE;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === PatientLanguage.EN) {
    return PatientLanguage.EN;
  }
  if (normalized === PatientLanguage.WO) {
    return PatientLanguage.WO;
  }

  return DEFAULT_PATIENT_LANGUAGE;
};
