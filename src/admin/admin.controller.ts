import { Controller, Get, UseGuards, SetMetadata } from '@nestjs/common';
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
}
