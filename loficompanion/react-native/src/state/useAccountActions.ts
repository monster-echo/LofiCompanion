import { useMemo } from 'react';
import { apiClient } from '../data/apiClient';
import {
  clearAuthStorage,
  clearNonEssentialStorage,
  saveRefreshToken,
  saveSessionToken,
} from '../data/storage';
import { AppUser } from '../domain/models';
import { i18n } from '../i18n/core';
import { telemetry } from '../telemetry/Telemetry';

export type Credentials = Readonly<{
  email: string;
  password: string;
  username?: string;
  consentVersion?: string;
}>;
export type SocialCredentials = Readonly<{
  provider: 'apple' | 'google' | 'github';
  idToken?: string;
  authorizationCode?: string;
  redirectUri?: string;
  codeVerifier?: string;
  nonce?: string;
}>;

type Input = Readonly<{
  run: <T>(operation: () => Promise<T>) => Promise<T>;
  setUser: React.Dispatch<React.SetStateAction<AppUser | null>>;
  onAuthenticated: () => void;
  onSignedOut: () => void;
  showToast: (message: string, tone?: 'success' | 'info' | 'error') => void;
}>;

export function useAccountActions(input: Input) {
  return useMemo(() => {
    const acceptSession = async (
      result: Awaited<ReturnType<typeof apiClient.signIn>>,
      message: string,
    ) => {
      await saveSessionToken(result.token);
      await saveRefreshToken(result.refreshToken);
      input.setUser(result.user);
      input.showToast(message, 'success');
      input.onAuthenticated();
    };
    const authenticate = async (credentials: Credentials, create: boolean) => {
      const method = create ? 'signup' : 'password';
      try {
        const result = await input.run(() => create
          ? apiClient.signUp(
            credentials.email,
            credentials.password,
            credentials.username ?? '',
            credentials.consentVersion ?? '',
          )
          : apiClient.signIn(credentials.email, credentials.password));
        await acceptSession(result, create ? i18n.t('errors:signUpSuccess') : i18n.t('errors:signInSuccess'));
        telemetry.track('auth_result', { method, outcome: 'success' });
        return true;
      } catch (error) {
        // 失败已由 run() 上报 app_error；此处补认证漏斗分类（成功/失败率可聚合）
        telemetry.track('auth_result', {
          method,
          outcome: 'failed',
          error_name: error instanceof Error ? error.name : 'unknown',
        });
        return false;
      }
    };
    const signOut = async () => {
      try {
        await input.run(apiClient.signOut);
      } catch {
        input.showToast(i18n.t('errors:credentialsCleared'), 'error');
      }
      await clearAuthStorage();
      telemetry.track('auth_signout', { scope: 'this_device' });
      input.setUser(null);
      input.onSignedOut();
    };
    const signOutAll = async () => {
      try {
        await input.run(apiClient.signOutAll);
      } catch {
        input.showToast(i18n.t('errors:credentialsCleared'), 'error');
      }
      await clearAuthStorage();
      await clearNonEssentialStorage();
      telemetry.track('auth_signout', { scope: 'all_devices' });
      input.setUser(null);
      input.onSignedOut();
    };
    return {
      signIn: (credentials: Credentials) => authenticate(credentials, false),
      signUp: (credentials: Credentials) => authenticate(credentials, true),
      socialSignIn: async (credentials: SocialCredentials) => {
        try {
          const result = await input.run(() => apiClient.socialSignIn(credentials));
          await acceptSession(result, i18n.t('errors:signInSuccess'));
          telemetry.track('auth_result', { method: credentials.provider, outcome: 'success' });
          return true;
        } catch (error) {
          telemetry.track('auth_result', {
            method: credentials.provider,
            outcome: 'failed',
            error_name: error instanceof Error ? error.name : 'unknown',
          });
          return false;
        }
      },
      requestPhoneCode: async (phone: string) => {
        try {
          await input.run(() => apiClient.requestPhoneCode(phone));
          return true;
        } catch { return false; }
      },
      verifyPhoneCode: async (phone: string, code: string) => {
        try {
          const result = await input.run(() => apiClient.verifyPhoneCode(phone, code));
          await acceptSession(result, i18n.t('errors:phoneSignInSuccess'));
          telemetry.track('auth_result', { method: 'phone', outcome: 'success' });
          return true;
        } catch (error) {
          telemetry.track('auth_result', {
            method: 'phone',
            outcome: 'failed',
            error_name: error instanceof Error ? error.name : 'unknown',
          });
          return false;
        }
      },
      signOut,
      signOutAll,
    };
  }, [input]);
}
