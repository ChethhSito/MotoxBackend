import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';

@Injectable()
export class FirebaseTokenService {
  async verify(token: string): Promise<DecodedIdToken> {
    if (!process.env.FIREBASE_PROJECT_ID) {
      throw new ServiceUnavailableException(
        'Firebase Admin no está configurado',
      );
    }
    const app =
      getApps()[0] ??
      initializeApp({
        credential: applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    return getAuth(app).verifyIdToken(token, true);
  }
}
