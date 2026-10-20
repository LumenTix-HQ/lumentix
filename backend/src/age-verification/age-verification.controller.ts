import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AgeProofService } from './age-verification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import {
  GenerateAgeProofDto,
  VerifyAgeProofDto,
  RegisterAgeProofVerifierDto,
} from './dto/age-verification.dto';

@ApiTags('Age Verification')
@ApiBearerAuth()
@Controller('age-verification')
@UseGuards(JwtAuthGuard)
@ApiResponse({ status: 401, description: 'Unauthorized' })
@ApiResponse({ status: 403, description: 'Forbidden' })
export class AgeProofController {
  constructor(private readonly ageProofService: AgeProofService) {}

  @Post('generate-proof')
  @ApiOperation({
    summary: 'Issue a server-signed proof that the caller meets a minimum age',
  })
  @ApiResponse({ status: 201, description: 'Age proof generated' })
  @ApiResponse({ status: 400, description: 'No verified age record or age too low' })
  generateAgeProof(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GenerateAgeProofDto,
  ) {
    // The subject is always the authenticated caller — never a body value.
    return this.ageProofService.generateAgeProof(req.user.id, dto.minimumAge);
  }

  @Post('verify-proof')
  @ApiOperation({ summary: 'Verify a server-signed age proof' })
  @ApiResponse({ status: 201, description: 'Age proof verification returned' })
  verifyAgeProof(@Body() dto: VerifyAgeProofDto) {
    return this.ageProofService.verifyAgeProof(dto.proof, dto.minimumAge);
  }

  @Post('register-verifier')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Register an age-proof verifier (admin only)' })
  @ApiResponse({ status: 201, description: 'Verifier registered' })
  @ApiResponse({ status: 409, description: 'Verifier already registered' })
  registerVerifier(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterAgeProofVerifierDto,
  ) {
    return this.ageProofService.registerVerifier(
      dto.verifierId,
      dto.name,
      req.user.id,
    );
  }
}
