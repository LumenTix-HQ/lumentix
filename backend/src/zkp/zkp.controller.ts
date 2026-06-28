import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ZkpService } from './zkp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GenerateAgeProofDto, VerifyAgeProofDto, RegisterZkpVerifierDto } from './dto/zkp.dto';

@ApiTags('ZKP')
@ApiBearerAuth()
@Controller('zkp')
@UseGuards(JwtAuthGuard)
export class ZkpController {
  constructor(private readonly zkpService: ZkpService) {}

  @Post('generate-age-proof')
  generateAgeProof(@Body() dto: GenerateAgeProofDto) {
    return this.zkpService.generate_age_proof(dto.userId, dto.birthYear, dto.minimumAge);
  }

  @Post('verify-age-proof')
  verifyAgeProof(@Body() dto: VerifyAgeProofDto) {
    return this.zkpService.verify_age_proof(dto.proof, dto.minimumAge);
  }

  @Post('register-verifier')
  registerVerifier(@Body() dto: RegisterZkpVerifierDto) {
    return this.zkpService.register_zkp_verifier(dto.verifierId, dto.name);
  }
}
