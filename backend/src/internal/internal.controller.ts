import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InternalSignatureGuard } from '../common/guards/internal-signature.guard';

@ApiTags('Internal')
@Controller('internal')
@UseGuards(InternalSignatureGuard)
export class InternalController {
  @Get('health')
  @ApiOperation({
    summary: 'Internal health check',
    description:
      'Protected by InternalSignatureGuard. Only requests carrying a valid ' +
      'X-Timestamp and X-Internal-Signature header pair are accepted.',
  })
  @ApiResponse({ status: 200, description: 'Internal service is healthy' })
  @ApiResponse({ status: 401, description: 'Missing or invalid internal signature' })
  health(): { status: string; timestamp: number } {
    return { status: 'ok', timestamp: Date.now() };
  }
}
