import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ZkpService } from './zkp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GenerateAgeProofDto, VerifyAgeProofDto, RegisterZkpVerifierDto } from './dto/zkp.dto';

@ApiTags('ZKP')
@ApiBearerAuth()
@Controller('zkp')
@UseGuards(JwtAuthGuard)
@ApiResponse({ status: 401, description: 'Unauthorized' })
@ApiResponse({ status: 403, description: 'Forbidden' })
export class ZkpController {
  constructor(private readonly zkpService: ZkpService) {}

  @Post('generate-age-proof')
  @ApiOperation({ summary: 'Generate a zero-knowledge age proof' })
  @ApiResponse({ status: 201, description: 'Age proof generated' })
  @ApiResponse({ status: 400, description: 'Invalid proof input' })
  generateAgeProof(@Body() dto: GenerateAgeProofDto) {
    return this.zkpService.generate_age_proof(dto.userId, dto.birthYear, dto.minimumAge);
  }

  @Post('verify-age-proof')
  @ApiOperation({ summary: 'Verify a zero-knowledge age proof' })
  @ApiResponse({ status: 201, description: 'Age proof verification returned' })
  @ApiResponse({ status: 400, description: 'Invalid proof' })
  @ApiResponse({ status: 422, description: 'Proof could not be verified' })
  verifyAgeProof(@Body() dto: VerifyAgeProofDto) {
    return this.zkpService.verify_age_proof(dto.proof, dto.minimumAge);
  }

  @Post('register-verifier')
  @ApiOperation({ summary: 'Register a zero-knowledge proof verifier' })
  @ApiResponse({ status: 201, description: 'Verifier registered' })
  @ApiResponse({ status: 400, description: 'Invalid verifier' })
  @ApiResponse({ status: 409, description: 'Verifier already registered' })
  registerVerifier(@Body() dto: RegisterZkpVerifierDto) {
    return this.zkpService.register_zkp_verifier(dto.verifierId, dto.name);
  }
}
