import { PatientProfile } from '../../common/enums/patient.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  profile: PatientProfile;
}
