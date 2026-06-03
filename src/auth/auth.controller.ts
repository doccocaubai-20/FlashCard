import { Controller, Post, Body, UnauthorizedException, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from 'src/users/users.service';
import { RegisterDTO } from './guards/dto/register-user.dto';
import { OAuth2Client } from 'google-auth-library';
@Controller('api/auth')
export class AuthController {
    private readonly googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
            const ticket = await this.googleClient.verifyIdToken({
                idToken: credential,
                audience: process.env.GOOGLE_CLIENT_ID,
            });

            const decodedPayload = ticket.getPayload();
            if (!decodedPayload) {
                throw new UnauthorizedException('Token Google không hợp lệ!');
            }
            const { email, name, picture, sub } = decodedPayload;

            if (!email) {
                throw new UnauthorizedException('Token Google không chứa địa chỉ email!');
            }

            payload = {
                email,
                name: name || email.split('@')[0],
                avatarUrl: picture,
                googleId: sub,
            };
        } catch (e) {
            throw new UnauthorizedException('Token xác thực Google không hợp lệ hoặc đã hết hạn!');
        }

        const user = await this.usersService.findOrCreateGoogleUser(payload);
        return this.authService.login(user);
    }
}
