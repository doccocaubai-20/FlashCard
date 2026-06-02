import { ConflictException, Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from "bcrypt"
import { RegisterDTO } from 'src/auth/guards/dto/register-user.dto';
@Injectable()
export class UsersService {

  constructor(private readonly prisma: PrismaService) { }
  async create(data: RegisterDTO) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      throw new ConflictException('Email đã được sử dụng!')
    }

    if (!data.password) {
      throw new BadRequestException('Password is required!')
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const newUser = await this.prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
      }
    })
    const { password, ...result } = newUser
    return result
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email }
    })
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      // select specific fields to return
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        role: true,
      }
    })
  }

  async update(id: number, data: any) {
    const updateData = { ...data };
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });
    const { password, ...result } = updatedUser;
    return result;
  }

  async remove(id: number) {
    return `This action removes a #${id} user`;
  }

  async validatePassword(user: any, password: string): Promise<boolean> {
    if (!user) {
      return false
    }
    return await bcrypt.compare(password, user.password)
  }
}
