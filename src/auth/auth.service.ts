import { UsersService } from 'src/users/users.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
    constructor(private readonly usersService: UsersService, private readonly jwtService: JwtService) { }

    async validateUser(email: string, password: string): Promise<any> {
        const user = await this.usersService.findByEmail(email);
        if (!user) {
            return null;
        }
        const isPasswordValid = await this.usersService.validatePassword(user, password);
        if (!isPasswordValid) {
            return null;
        }
        const { password: _password, ...safeUser } = user;
        return safeUser;
    }

    async login(user: any) {

        // B1 tao payload, id de vao sub
        const payload = { email: user.email, role: user.role, sub: user.id };
        // B2 sign return token
        return {
            access_token: await this.jwtService.signAsync(payload),
        };

    }
}
