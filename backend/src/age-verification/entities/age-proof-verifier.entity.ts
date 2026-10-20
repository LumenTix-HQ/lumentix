import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Registered age-proof verifiers.
 *
 * Previously held in an in-memory `Map`, which meant registrations were lost on
 * restart and never shareable across instances. Persisting them lets admins
 * manage the trusted verifier set explicitly.
 */
@Entity('age_proof_verifiers')
export class AgeProofVerifier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Caller-supplied identifier for the verifier (e.g. an event organizer id). */
  @Index({ unique: true })
  @Column()
  verifierId: string;

  /** Human-readable verifier name. */
  @Column()
  name: string;

  /** UUID of the admin who registered this verifier. */
  @Column({ type: 'uuid', nullable: true })
  registeredBy: string | null;

  @CreateDateColumn()
  registeredAt: Date;
}
