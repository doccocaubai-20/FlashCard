import { Controller, Post, Body, UnauthorizedException, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Prisma } from '@prisma/client';
import { UsersService } from 'src/users/users.service';
import { RegisterDTO } from './guards/dto/register-user.dto';
@Controller('api/auth')
export class AuthController {
    constructor(private readonly authService: AuthService,
        private readonly usersService: UsersService) { }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() body: Record<string, string>) {
        const { email, password } = body
        const user = await this.authService.validateUser(email, password)
        if (!user) {
            throw new UnauthorizedException('Email hoặc mật khẩu không đúng!')
        }
        return this.authService.login(user)
    }
    @Post('register')
    async register(@Body() body: RegisterDTO) {
        const newUser = await this.usersService.create(body);

        return this.authService.login(newUser);
    }
}
