import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { AuthProviderIcon } from './AuthProviderIcon';
import { useApp } from '../state/AppStore';
import { useTranslation } from 'react-i18next';
import { spacing } from '../theme/tokens';
import type { ThemeColors } from '../theme/tokens';
import { useThemeStyles } from '../theme/useThemeStyles';

WebBrowser.maybeCompleteAuthSession();

const githubDiscovery = {
  authorizationEndpoint: 'https://github.com/login/oauth/authorize',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
};

export function SocialAuthButtons({
  onBeforeAuthenticate,
}: Readonly<{ onBeforeAuthenticate?: () => boolean | Promise<boolean> }>) {
  const {
    authProviders,
    authProviderPolicy,
    authProviderConfig,
    navigate,
    socialSignIn,
    showToast,
  } = useApp();
  const { t } = useTranslation('auth');
  const socialStyles = useThemeStyles(makeStyles);
  const [appleAvailable, setAppleAvailable] = useState(false);
  // scheme 必须与 app.json 的 expo.scheme 一致，否则 OAuth 回调无法返回本 app；
  // 该 URI 同时要登记到 provider 控制台（GitHub 回调 URL）。Google 已改走原生
  // SDK（Google 关闭 Web 客户端自定义 scheme 重定向的口子），不走这条回调。
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'lofi-companion', path: 'oauth' });
  const nonce = useMemo(() => Crypto.randomUUID(), []);
  const githubId = authProviderConfig.github?.clientId ?? 'not-configured';
  const googleId = authProviderConfig.google?.clientId ?? 'not-configured';
  const [githubRequest, githubResponse, promptGitHub] = AuthSession.useAuthRequest({
    clientId: githubId,
    redirectUri,
    scopes: ['read:user', 'user:email'],
    usePKCE: true,
  }, githubDiscovery);

  useEffect(() => {
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  useEffect(() => {
    if (githubResponse?.type === 'success' && githubRequest?.codeVerifier) {
      void socialSignIn({
        provider: 'github',
        authorizationCode: githubResponse.params.code,
        redirectUri,
        codeVerifier: githubRequest.codeVerifier,
      });
    } else if (githubResponse?.type === 'error') {
      showToast(t('githubFailed'), 'error');
    }
  }, [githubRequest, githubResponse, redirectUri, showToast, socialSignIn]);

  // Google：原生 SDK 弹账号选择器，直接拿 idToken 交服务端验签（aud/签名）。
  // SDK 不支持注入 nonce，故不向服务端传 nonce（服务端对缺省 nonce 跳过校验）。
  // 服务端 clientIds 按平台下发：ios 槽= iOS 类型客户端；android 槽= Web 类型
  // 客户端（Android 端 requestIdToken(webClientId) 才会返回 idToken，其 aud 即
  // 该 Web id；app 本身的授权由控制台里 Android 客户端的 package+SHA-1 登记，
  // 那个 id 不进代码）。Android 缺 webClientId 时 idToken 为 null、登录静默失败。
  const signInWithGoogle = async () => {
    if (onBeforeAuthenticate && !(await onBeforeAuthenticate())) return;
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices();
      GoogleSignin.configure({ webClientId: googleId });
    } else {
      GoogleSignin.configure({ iosClientId: googleId });
    }
    try {
      const response = await GoogleSignin.signIn();
      const idToken = response.type === 'success' ? response.data.idToken : null;
      if (!idToken) return; // 用户取消
      await socialSignIn({ provider: 'google', idToken });
    } catch (error) {
      if ((error as { code?: string }).code !== 'SIGN_IN_CANCELLED') {
        showToast(t('googleFailed'), 'error');
      }
    }
  };

  const signInWithApple = async () => {
    if (onBeforeAuthenticate && !(await onBeforeAuthenticate())) return;
    try {
      const result = await AppleAuthentication.signInAsync({
        nonce,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (result.identityToken) {
        await socialSignIn({ provider: 'apple', idToken: result.identityToken, nonce });
      }
    } catch (error) {
      if ((error as { code?: string }).code !== 'ERR_REQUEST_CANCELED') {
        showToast(t('appleFailed'), 'error');
      }
    }
  };

  const visible = authProviderPolicy.apple
    || authProviderPolicy.google
    || authProviderPolicy.github
    || authProviderPolicy.phone;
  if (!visible) return null;
  return (
    <View style={socialStyles.section}>
      <View style={socialStyles.divider}>
        <View style={socialStyles.line} />
        <Text style={socialStyles.caption}>{t('otherWays')}</Text>
        <View style={socialStyles.line} />
      </View>
      <View style={socialStyles.row}>
      {authProviderPolicy.apple ? (
        <AuthProviderIcon
          enabled={authProviders.apple && appleAvailable && Platform.OS === 'ios'}
          label="Apple"
          name="apple"
          onPress={() => void signInWithApple()}
        />
      ) : null}
      {authProviderPolicy.google ? (
        <AuthProviderIcon
          enabled={authProviders.google}
          label="Google"
          name="google"
          onPress={() => void signInWithGoogle()}
        />
      ) : null}
      {authProviderPolicy.github ? (
        <AuthProviderIcon
          enabled={authProviders.github}
          label="GitHub"
          name="github"
          onPress={() => {
            void (async () => {
              if (!onBeforeAuthenticate || (await onBeforeAuthenticate())) promptGitHub();
            })();
          }}
        />
      ) : null}
      {authProviderPolicy.phone ? (
        <AuthProviderIcon
          enabled={authProviders.phone}
          label={t('labelPhoneShort')}
          name="phone"
          onPress={() => {
            void (async () => {
              if (!onBeforeAuthenticate || (await onBeforeAuthenticate())) navigate('auth.phone');
            })();
          }}
        />
      ) : null}
      </View>
    </View>
  );
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  section: { gap: spacing.x3 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.x3 },
  line: { flex: 1, height: 1, backgroundColor: p.border },
  caption: { color: p.textSecondary, fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: spacing.x4 },
});
