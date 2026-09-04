import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkillLogsService } from './skill-logs.service';

@Controller('api/skill-logs')
@UseGuards(AuthGuard('jwt'))
export class SkillLogsController {
  constructor(private readonly skillLogsService: SkillLogsService) {}

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.skillLogsService.create(req.user.id, body);
  }

  @Get()
  findAll(
    @Req() req: any,
    @Query('skillType') skillType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.skillLogsService.findAll(
      req.user.id,
      skillType,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('stats')
  getStats(@Req() req: any) {
    return this.skillLogsService.getStats(req.user.id);
  }
}
