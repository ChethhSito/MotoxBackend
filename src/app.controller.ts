import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  info() {
    return { service: 'motox-api', status: 'running' };
  }
}
