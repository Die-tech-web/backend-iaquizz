import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('health_professionals')
@Unique(['email'])
export class HealthProfessionalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 180 })
  email: string;

  @Column({ type: 'varchar', length: 255, select: true })
  passwordHash: string;

  @Column({ type: 'varchar', length: 80 })
  firstName: string;

  @Column({ type: 'varchar', length: 80 })
  lastName: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  specialty: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  facilityName: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  licenseNumber: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
