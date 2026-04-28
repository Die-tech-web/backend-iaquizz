import { PatientProfile } from '../../common/enums/patient.enum';
import { AuthRole } from '../../common/enums/auth-role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: AuthRole;
  profile?: PatientProfile;
}
