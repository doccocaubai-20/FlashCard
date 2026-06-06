import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  SetMetadata,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { AdminService } from './admin.service';

@Controller('api/admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@SetMetadata('roles', ['ADMIN'])
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Patch('users/:id/role')
  updateUserRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { role: string },
  ) {
    return this.adminService.updateUserRole(id, body.role);
  }

  @Get('decks')
  getAllDecks(@Query('filter') filter?: string) {
    return this.adminService.getAllDecks(filter);
  }

  @Post('decks')
  createSystemDeck(@Body() body: { title: string; description?: string }) {
    return this.adminService.createSystemDeck(body);
  }

  @Patch('decks/:id')
  updateDeck(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      title?: string;
      description?: string;
      isPublic?: boolean;
      isSystem?: boolean;
    },
  ) {
    return this.adminService.updateDeck(id, body);
  }

  @Delete('decks/:id')
  deleteDeck(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteDeck(id);
  }
}
