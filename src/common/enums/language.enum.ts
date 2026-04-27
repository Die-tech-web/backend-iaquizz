export enum PatientLanguage {
  FR = 'fr',
  EN = 'en',
}

export const DEFAULT_PATIENT_LANGUAGE = PatientLanguage.FR;

export const SUPPORTED_PATIENT_LANGUAGES = [
  PatientLanguage.FR,
  PatientLanguage.EN,
] as const;

export const resolvePatientLanguage = (value?: string | null): PatientLanguage => {
  if (!value) {
    return DEFAULT_PATIENT_LANGUAGE;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === PatientLanguage.EN) {
    return PatientLanguage.EN;
  }

  return DEFAULT_PATIENT_LANGUAGE;
};
