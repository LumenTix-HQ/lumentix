import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') || 'placeholder',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || 'placeholder',
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') || 'http://localhost:8000/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, emails, displayName, photos } = profile;
    const user = {
      googleId: id,
      email: emails[0].value,
      displayName,
      photo: photos?.[0]?.value,
    };
    done(null, user);
  }
}
