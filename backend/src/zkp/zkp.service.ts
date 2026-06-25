import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ZkpService {
  private readonly verifiers = new Map<string, { name: string; registeredAt: Date }>();

  generate_age_proof(userId: string, birthYear: number, minimumAge: number) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - birthYear;
    if (age < 0 || age > 150) throw new BadRequestException('Invalid birth year');
    // Simulate ZKP: proof proves age >= minimumAge without revealing exact age
    const proof = Buffer.from(JSON.stringify({ userId, ageGte: minimumAge, valid: age >= minimumAge })).toString('base64');
    return { proof, minimumAge, generated: true };
  }

  verify_age_proof(proof: string, minimumAge: number) {
    try {
      const data = JSON.parse(Buffer.from(proof, 'base64').toString());
      return { valid: data.valid === true && data.ageGte === minimumAge, minimumAge };
    } catch {
      return { valid: false, minimumAge };
    }
  }

  register_zkp_verifier(verifierId: string, name: string) {
    this.verifiers.set(verifierId, { name, registeredAt: new Date() });
    return { verifierId, name, registered: true };
  }
}
