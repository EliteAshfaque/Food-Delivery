import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as bcrypt from 'bcrypt';
import { AccountStatus, UserRole, type JwtPayload } from '@food-delivery/types';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { schema } from '../db/relations';
import { user } from '../db/schema';
import type { User } from '../db/schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { isPostgresUniqueViolation } from '../db/is-unique-violation';

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();
  private readonly googleWebClientId: string;

  constructor(
    @Inject('DB') private readonly db: NeonDatabase<typeof schema>,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    // OAuth client IDs are public identifiers, but deployers may still replace
    // this project default through GOOGLE_WEB_CLIENT_ID.
    this.googleWebClientId = configService.get<string>(
      'GOOGLE_WEB_CLIENT_ID',
      '181181927620-ii56m5gh1kqmq9hovj6vfquv4bm2poti.apps.googleusercontent.com',
    );
  }

  async register(registerDto: RegisterDto) {
    // Keep this authorization check in the service as well as the DTO. DTO
    // validation is a convenience boundary, not an authorization boundary.
    if (registerDto.role === UserRole.ADMIN) {
      throw new ForbiddenException(
        'Administrator accounts cannot self-register',
      );
    }

    const normalizedEmail = this.normalizeEmail(registerDto.email);
    const [existing] = await this.db
      .select()
      .from(user)
      .where(sql`lower(${user.email}) = ${normalizedEmail}`);

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const accountStatus =
      registerDto.role === UserRole.CUSTOMER
        ? AccountStatus.ACTIVE
        : AccountStatus.PENDING_APPROVAL;
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    let created: User;
    try {
      [created] = await this.db
        .insert(user)
        .values({
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          email: normalizedEmail,
          password: hashedPassword,
          role: registerDto.role,
          accountStatus,
          accountStatusUpdatedAt: new Date(),
        })
        .returning();
    } catch (error) {
      // The friendly lookup above improves the common case. The database index
      // is still authoritative when two registrations race.
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException('Email already exists');
      }
      throw error;
    }

    // A pending operator must not receive a usable session. This prevents a
    // self-registered driver or restaurant owner from bypassing moderation.
    if (created.accountStatus !== AccountStatus.ACTIVE) {
      return {
        user: this.sanitizeUser(created),
        requiresApproval: true,
        message:
          'Your account is pending administrator approval. We will notify you once it is active.',
      };
    }

    return this.createAuthResponse(created);
  }

  async login(loginDto: LoginDto) {
    const normalizedEmail = this.normalizeEmail(loginDto.email);
    const [foundUser] = await this.db
      .select()
      .from(user)
      .where(sql`lower(${user.email}) = ${normalizedEmail}`);

    if (!foundUser || !foundUser.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      foundUser.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.createAuthResponse(foundUser);
  }

  /**
   * Validates the signed Google ID token on the API, then creates or links a
   * customer account. The mobile app never decides a user's name, email, or
   * role; all identity claims come from the verified Google token.
   */
  async googleLogin(idToken: string) {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleWebClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google identity token');
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    const [googleUser] = await this.db
      .select()
      .from(user)
      .where(eq(user.googleSubject, payload.sub));

    if (googleUser) {
      const refreshed = await this.maybeApplyGooglePicture(
        googleUser,
        payload.picture,
      );
      return this.createGoogleCustomerSession(refreshed);
    }

    const normalizedEmail = this.normalizeEmail(payload.email);
    const [emailUser] = await this.db
      .select()
      .from(user)
      .where(sql`lower(${user.email}) = ${normalizedEmail}`);

    if (emailUser) {
      if (emailUser.role !== UserRole.CUSTOMER) {
        throw new ForbiddenException(
          'Google sign-in is available for customer accounts only',
        );
      }

      if (emailUser.googleSubject && emailUser.googleSubject !== payload.sub) {
        throw new ConflictException(
          'This email is linked to another Google account',
        );
      }

      const linkedUser = await this.linkGoogleIdentity(emailUser, payload.sub);
      const withPicture = await this.maybeApplyGooglePicture(
        linkedUser,
        payload.picture,
      );
      return this.createGoogleCustomerSession(withPicture);
    }

    let createdUser: User;
    try {
      [createdUser] = await this.db
        .insert(user)
        .values({
          firstName: this.normalizeGoogleName(
            payload.given_name ?? payload.name,
            'Google',
          ),
          lastName: this.normalizeGoogleName(payload.family_name, ''),
          email: normalizedEmail,
          googleSubject: payload.sub,
          imageUrl: this.normalizeOptionalUrl(payload.picture),
          role: UserRole.CUSTOMER,
        })
        .returning();
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        // A normal registration or another Google request can win the insert
        // race. Resolve the resulting account in this request instead of
        // requiring the customer to retry sign-in manually.
        return this.resolveConcurrentGoogleAccount(
          normalizedEmail,
          payload.sub,
        );
      }
      throw error;
    }

    return this.createGoogleCustomerSession(createdUser);
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

  async updateProfile(
    userId: string,
    dto: {
      firstName: string;
      lastName: string;
      imageUrl?: string | null;
    },
  ) {
    const patch: {
      firstName: string;
      lastName: string;
      updatedAt: Date;
      imageUrl?: string | null;
    } = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      updatedAt: new Date(),
    };

    if (dto.imageUrl !== undefined) {
      patch.imageUrl = dto.imageUrl;
    }

    const [updatedUser] = await this.db
      .update(user)
      .set(patch)
      .where(eq(user.id, userId))
      .returning();

    if (!updatedUser) {
      throw new UnauthorizedException('User not found');
    }

    this.assertAccountIsActive(updatedUser);
    return { user: this.sanitizeUser(updatedUser) };
  }

  /** Prefer keeping a user-uploaded photo; only fill empty avatars from Google. */
  private async maybeApplyGooglePicture(
    dbUser: User,
    picture: string | undefined,
  ) {
    if (dbUser.imageUrl) return dbUser;
    const imageUrl = this.normalizeOptionalUrl(picture);
    if (!imageUrl) return dbUser;

    const [updated] = await this.db
      .update(user)
      .set({ imageUrl, updatedAt: new Date() })
      .where(eq(user.id, dbUser.id))
      .returning();

    return updated ?? dbUser;
  }

  private normalizeOptionalUrl(value: string | undefined) {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 2048) return null;
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return trimmed;
  }

  private createGoogleCustomerSession(dbUser: User) {
    if (dbUser.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException(
        'Google sign-in is available for customer accounts only',
      );
    }

    return this.createAuthResponse(dbUser);
  }

  /**
   * Links a verified Google identity without allowing a stale read to replace
   * a different identity that was linked concurrently.
   */
  private async linkGoogleIdentity(dbUser: User, googleSubject: string) {
    try {
      const [linkedUser] = await this.db
        .update(user)
        .set({ googleSubject, updatedAt: new Date() })
        .where(and(eq(user.id, dbUser.id), isNull(user.googleSubject)))
        .returning();

      if (linkedUser) return linkedUser;
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException(
          'This Google account is already linked to another user',
        );
      }
      throw error;
    }

    const [currentUser] = await this.db
      .select()
      .from(user)
      .where(eq(user.id, dbUser.id));

    if (currentUser?.googleSubject === googleSubject) {
      return currentUser;
    }

    throw new ConflictException(
      'This email is linked to another Google account',
    );
  }

  private async resolveConcurrentGoogleAccount(
    normalizedEmail: string,
    googleSubject: string,
  ) {
    const [subjectUser] = await this.db
      .select()
      .from(user)
      .where(eq(user.googleSubject, googleSubject));
    if (subjectUser) {
      return this.createGoogleCustomerSession(subjectUser);
    }

    const [emailUser] = await this.db
      .select()
      .from(user)
      .where(sql`lower(${user.email}) = ${normalizedEmail}`);
    if (!emailUser) {
      throw new ConflictException(
        'We could not finish linking this Google account. Please try again.',
      );
    }

    if (emailUser.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException(
        'Google sign-in is available for customer accounts only',
      );
    }

    if (emailUser.googleSubject && emailUser.googleSubject !== googleSubject) {
      throw new ConflictException(
        'This email is linked to another Google account',
      );
    }

    return this.createGoogleCustomerSession(
      await this.linkGoogleIdentity(emailUser, googleSubject),
    );
  }

  private createAuthResponse(dbUser: User) {
    this.assertAccountIsActive(dbUser);
    const safeUser = this.sanitizeUser(dbUser);
    const token = this.generateToken(safeUser);
    return { user: safeUser, token };
  }

  async savePushToken(
    userId: string,
    token: string,
    platform: 'android' | 'ios',
  ) {
    const normalized = token.trim();
    if (!normalized) throw new BadRequestException('Push token is required');

    // `fcm:` is an explicit server-side provider marker for a native Android
    // FCM registration token. Expo tokens intentionally have no marker and
    // continue to use Expo's push service. Keeping the distinction in the
    // stored value lets one deployment serve both token types safely.
    if (normalized.startsWith('fcm:')) {
      if (platform !== 'android') {
        throw new BadRequestException(
          'Direct FCM registration is currently supported for Android only',
        );
      }
      if (!normalized.slice('fcm:'.length).trim()) {
        throw new BadRequestException('FCM push token is required');
      }
    }

    const storedToken = `${platform}:${normalized}`;
    await this.db.transaction(async (tx) => {
      // A physical device may sign out and then sign into another account.
      // Serialize ownership of this exact provider token so notifications can
      // never continue going to the previous account after that handoff.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`push-token:${storedToken}`}))`,
      );
      await tx
        .update(user)
        .set({ pushToken: null, updatedAt: new Date() })
        .where(and(eq(user.pushToken, storedToken), ne(user.id, userId)));

      const [updated] = await tx
        .update(user)
        .set({ pushToken: storedToken, updatedAt: new Date() })
        .where(eq(user.id, userId))
        .returning({ id: user.id });
      if (!updated) throw new BadRequestException('User not found');
    });

    return { ok: true };
  }

  private generateToken(
    safeUser: Omit<
      User,
      'password' | 'googleSubject' | 'pushToken' | 'accountStatusReason'
    >,
  ) {
    if (!safeUser.email) {
      throw new UnauthorizedException('User email is missing');
    }

    const payload: JwtPayload = {
      sub: safeUser.id,
      email: safeUser.email,
      role: safeUser.role,
    };
    return this.jwtService.sign(payload);
  }

  private sanitizeUser(
    dbUser: User,
  ): Omit<
    User,
    'password' | 'googleSubject' | 'pushToken' | 'accountStatusReason'
  > {
    const {
      password,
      googleSubject,
      pushToken,
      accountStatusReason,
      ...safeUser
    } = dbUser;
    void password;
    void googleSubject;
    void pushToken;
    void accountStatusReason;
    return safeUser;
  }

  private assertAccountIsActive(dbUser: User) {
    if (dbUser.accountStatus === AccountStatus.ACTIVE) {
      return;
    }

    const message =
      dbUser.accountStatus === AccountStatus.PENDING_APPROVAL
        ? 'Your account is pending administrator approval'
        : dbUser.accountStatus === AccountStatus.SUSPENDED
          ? 'Your account has been suspended'
          : 'Your account has been rejected';
    throw new ForbiddenException(message);
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private normalizeGoogleName(value: string | undefined, fallback: string) {
    const normalized = value?.trim().slice(0, 80);
    return normalized || fallback;
  }
}
