import { Module, Global } from '@nestjs/common';
import { InternalSignatureGuard } from './guards/internal-signature.guard';
import { InternalHttpClientService } from './http/internal-http-client.service';

@Global()
@Module({
  providers: [InternalSignatureGuard, InternalHttpClientService],
  exports: [InternalSignatureGuard, InternalHttpClientService],
})
export class InternalModule {}
