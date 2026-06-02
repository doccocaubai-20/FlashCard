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

    @Post('google')
    @HttpCode(HttpStatus.OK)
    async googleLogin(@Body() body: { credential?: string }) {
        let payload: { email: string; name: string; avatarUrl?: string; googleId: string };

        const credential = body.credential;
        if (!credential) {
            throw new UnauthorizedException('Không tìm thấy thông tin xác thực từ Google!');
        }

        try {
            // Base64 decode Google JWT payload without external libraries
            const parts = credential.split('.');
            if (parts.length < 2) {
                throw new Error('Invalid token format');
            }
            const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
            const { email, name, picture, sub } = decodedPayload;

            if (!email) {
                throw new UnauthorizedException('Token Google không chứa địa chỉ email!');
            }

            payload = {
                email,
                name,
                avatarUrl: picture,
                googleId: sub,
            };
        } catch (e) {
            throw new UnauthorizedException('Token xác thực Google không hợp lệ!');
        }

        const user = await this.usersService.findOrCreateGoogleUser(payload);
        return this.authService.login(user);
    }
}
