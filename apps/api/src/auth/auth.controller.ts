import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsString, MaxLength } from 'class-validator';
import type { JwtPayload } from '@food-delivery/types';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

class RegisterPushTokenDto {
  @IsString()
  @MaxLength(4096)
  token!: string;

  @IsIn(['android', 'ios'])
  platform!: 'android' | 'ios';
}

@Controller('auth') //api/auth/register, api/auth/login, api/auth/me
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('google')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto.idToken);
  }

  @Get('me')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: JwtPayload }) {
    return this.authService.getProfile(req.user.sub);
  }

  @Patch('me')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  updateMe(@Req() req: { user: JwtPayload }, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.sub, dto);
  }

  @Post('push-token')
  @UseGuards(JwtAuthGuard)
  savePushToken(
    @Req() req: { user: JwtPayload },
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.authService.savePushToken(
      req.user.sub,
      dto.token,
      dto.platform,
    );
  }
}
