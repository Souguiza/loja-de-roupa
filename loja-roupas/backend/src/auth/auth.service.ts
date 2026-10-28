import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt-payload';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException('A senha deve ter no máximo 72 bytes.');
    }
    const email = dto.email.toLowerCase();

    const exists = await this.prisma.customer.findUnique({ where: { email } });
    if (exists) throw new ConflictException('E-mail já cadastrado');

    if (dto.cpf) {
      const cpfExists = await this.prisma.customer.findUnique({ where: { cpf: dto.cpf } });
      if (cpfExists) throw new ConflictException('CPF já cadastrado');
    }

    const customer = await this.prisma.customer.create({
      data: {
        name: dto.name,
        email,
        phone: dto.phone,
        cpf: dto.cpf,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
    });

    return this.sign({ sub: customer.id, email: customer.email, role: 'customer' }, customer.name);
  }

  async login(dto: LoginDto) {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    const customer = await this.prisma.customer.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!customer?.passwordHash || !(await bcrypt.compare(dto.password, customer.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    return this.sign({ sub: customer.id, email: customer.email, role: 'customer' }, customer.name);
  }

  async adminLogin(dto: LoginDto) {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!admin || !(await bcrypt.compare(dto.password, admin.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    const role = admin.role === 'OWNER' ? 'owner' : 'staff';
    return this.sign({ sub: admin.id, email: admin.email, role }, admin.name);
  }

  async me(payload: JwtPayload) {
    if (payload.role === 'customer') {
      return this.prisma.customer.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, email: true, phone: true },
      });
    }
    return this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  private sign(payload: JwtPayload, name: string) {
    return {
      accessToken: this.jwt.sign(payload),
      user: { id: payload.sub, name, email: payload.email, role: payload.role },
    };
  }
}
