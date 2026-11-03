import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import { HealthResponseDto } from './dto/health-response.dto';
import { AppService } from './app.service';

@ApiTags('api')
@Controller('api')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Returns the current health status of the application',
  })
  @ApiResponse({
    status: 200,
    description: 'Application is healthy',
    type: HealthResponseDto,
  })
  getHealth(): HealthResponseDto {
    return this.appService.getHealth();
  }

  @Get('health/db')
  // Never let a CDN answer this: the keep-alive cron needs every call to reach the database.
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Database health check',
    description:
      'Runs a minimal read against the database. Called on a schedule by Vercel Cron ' +
      '(backend/vercel.json) so the Supabase Free-plan project is not paused for inactivity',
  })
  @ApiResponse({
    status: 200,
    description: 'Database is reachable',
    type: HealthResponseDto,
  })
  @ApiServiceUnavailableResponse({ description: 'Database is unreachable' })
  getDatabaseHealth(): Promise<HealthResponseDto> {
    return this.appService.getDatabaseHealth();
  }
}
