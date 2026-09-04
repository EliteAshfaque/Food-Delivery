import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as bcrypt from 'bcrypt';
import type { JwtPayload } from '@food-delivery/types';
import { schema } from '../db/relations';
import { user } from '../db/schema';
import type { User } from '../db/schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject('DB') private readonly db: NeonHttpDatabase<typeof schema>,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const [existing] = await this.db
      .select()
      .from(user)
      .where(eq(user.email, registerDto.email));

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const [created] = await this.db
      .insert(user)
      .values({
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        email: registerDto.email,
        password: hashedPassword,
        role: registerDto.role,
      })
      .returning();

    const safeUser = this.sanitizeUser(created);
    const token = this.generateToken(safeUser);

    return { user: safeUser, token };
  }

  async login(loginDto: LoginDto) {
    const [foundUser] = await this.db
      .select()
      .from(user)
      .where(eq(user.email, loginDto.email));

    if (!foundUser) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      foundUser.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const safeUser = this.sanitizeUser(foundUser);
    const token = this.generateToken(safeUser);
    return { user: safeUser, token };
  }

  async getProfile(userId: string) {
    const [foundUser] = await this.db
      .select()
      .from(user)
      .where(eq(user.id, userId));

    if (!foundUser) {
      throw new UnauthorizedException('User not found');
    }

    return { user: this.sanitizeUser(foundUser) };
  }

  private generateToken(safeUser: Omit<User, 'password'>) {
    const payload: JwtPayload = {
      sub: safeUser.id,
      email: safeUser.email!,
      role: safeUser.role,
    };
    return this.jwtService.sign(payload);
  }

  private sanitizeUser(dbUser: User) {
    const { password, ...safeUser } = dbUser;
    void password;
    return safeUser;
  }
}
