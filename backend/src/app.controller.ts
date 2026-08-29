import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Application')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get application status message' })
  @ApiResponse({ status: 200, description: 'Application status returned', type: String })
  getHello(): string {
    return this.appService.getHello();
  }
}
