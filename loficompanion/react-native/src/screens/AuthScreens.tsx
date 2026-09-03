import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppButton, PageHeader } from '../design-system/components';
import { usePreferences } from '../preferences/PreferencesProvider';
import { useApp } from '../state/AppStore';
import { spacing } from '../theme/tokens';
import { styles } from '../theme/styles';
import { useAuthRecovery } from '../auth/AuthRecoveryStore';
import { SocialAuthButtons } from '../auth/SocialAuthButtons';
import { useTranslation } from 'react-i18next';
import { auth as authStrings } from '../i18n/locales/zh-CN/auth';

export type AuthMode = 'signIn' | 'signUp' | 'phone' | 'forgot' | 'verify' | 'reset';

type AuthKey = keyof typeof authStrings;

// 标题/主行动按模式取键（文案在 i18n auth 命名空间）
const authCopy: Record<AuthMode, Readonly<{ titleKey: AuthKey; actionKey: AuthKey }>> = {
  signIn: { titleKey: 'titleSignIn', actionKey: 'actionSignIn' },
  signUp: { titleKey: 'titleSignUp', actionKey: 'actionSignUp' },
  phone: { titleKey: 'titlePhone', actionKey: 'actionSendCode' },
  forgot: { titleKey: 'titleForgot', actionKey: 'actionSendCode' },
  verify: { titleKey: 'titleVerify', actionKey: 'actionConfirmCode' },
  reset: { titleKey: 'titleReset', actionKey: 'actionConfirmChange' },
};

export function AuthScreen({ mode }: Readonly<{ mode: AuthMode }>) {
  const { palette } = usePreferences();
  const { t } = useTranslation('auth');
  const {
    navigate,
    signIn,
    signUp,
    requestPhoneCode,
    verifyPhoneCode,
    showToast,
    busy: accountBusy,
    config,
    lastAuthError,
    clearAuthError,
  } = useApp();
  const recovery = useAuthRecovery();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('+86');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const copy = authCopy[mode];
  const busy = accountBusy || recovery.busy;
  const termsRevision = config.legal.find((document) => document.type === 'terms')?.revision
    ?? 'unknown';

  const submit = async () => {
    if (mode === 'forgot') {
      await recovery.requestCode(email);
      return;
    }
    if (mode === 'verify') {
      await recovery.verifyCode(code);
      return;
    }
    if (mode === 'reset') {
      await recovery.resetPassword(password);
      return;
    }
    if (mode === 'phone') {
      // 首次登录/注册前必须完成协议授权（合规：任何账号创建路径都要拦截）
      if (!ensureConsent()) return;
      if (!phoneCodeSent) {
        if (await requestPhoneCode(phone)) {
          setPhoneCodeSent(true);
          showToast(t('codeSent'), 'success');
        }
        return;
      }
      await verifyPhoneCode(phone, code);
      return;
    }
    if ((mode === 'signIn' || mode === 'signUp') && !ensureConsent()) return;
    if (mode === 'signUp') {
      await signUp({ email, password, username, consentVersion: termsRevision });
    } else {
      await signIn({ email, password });
    }
  };

  const ensureConsent = () => {
    if (agreed) return true;
    showToast(t('consentRequired'), 'info');
    return false;
  };

  return (
    <View style={styles.page}>
      <PageHeader title={t(copy.titleKey)} />
      <ScrollView contentContainerStyle={authStyles.content}>
        <View style={authStyles.copy}>
          <Text style={styles.title}>{t(copy.titleKey)}</Text>
          <Text style={styles.secondary}>{t('subtitle')}</Text>
        </View>
        {mode === 'signUp' ? (
          <TextInput
            accessibilityLabel={t('labelUsername')}
            onChangeText={setUsername}
            placeholderTextColor={palette.textSecondary}

            placeholder={t('placeholderUsername')}
            style={styles.input}
            value={username}
          />
        ) : null}
        {mode === 'phone' ? (
          <>
            <TextInput
              accessibilityLabel={t('labelPhone')}
              keyboardType="phone-pad"
              onChangeText={setPhone}
              placeholderTextColor={palette.textSecondary}

              placeholder="+86 13800000000"
              style={styles.input}
              value={phone}
            />
            {phoneCodeSent ? (
              <TextInput
                accessibilityLabel={t('labelSmsCode')}
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={setCode}
                placeholderTextColor={palette.textSecondary}

                placeholder={t('placeholderSmsCode')}
                style={styles.input}
                value={code}
              />
            ) : null}
          </>
        ) : null}
        {mode === 'signIn' || mode === 'signUp' || mode === 'forgot' ? (
          <TextInput
            accessibilityLabel={mode === 'signIn' ? t('labelAccount') : t('labelEmail')}
            autoCapitalize="none"
            onChangeText={(value) => { setEmail(value); clearAuthError(); }}
            placeholderTextColor={palette.textSecondary}

            placeholder={mode === 'signIn' ? t('placeholderAccount') : t('placeholderEmail')}
            style={styles.input}
            value={email}
          />
        ) : null}
        {mode === 'verify' ? (
          <Text style={styles.secondary}>{t('codeSentTo', { email: recovery.email })}</Text>
        ) : null}
        {mode !== 'forgot' && mode !== 'verify' && mode !== 'phone' ? (
          <TextInput
            accessibilityLabel={t('labelPassword')}
            onChangeText={(value) => { setPassword(value); clearAuthError(); }}
            placeholderTextColor={palette.textSecondary}

            placeholder={mode === 'reset' ? t('placeholderNewPassword') : t('placeholderPassword')}
            secureTextEntry
            style={styles.input}
            value={password}
          />
        ) : null}
        {mode === 'verify' ? (
          <TextInput
            accessibilityLabel={t('labelCode')}
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={setCode}
            placeholderTextColor={palette.textSecondary}

            placeholder={t('placeholderCode')}
            style={styles.input}
            value={code}
          />
        ) : null}
        {lastAuthError ? (
          <Text style={[authStyles.errorText, { color: palette.error }]}>{lastAuthError}</Text>
        ) : null}
        <AppButton
          disabled={busy || !isValid({ mode, email, password, username, code, phone, phoneCodeSent })}
          label={busy ? t('processing') : mode === 'phone' && phoneCodeSent ? t('actionVerifyAndSignIn') : t(copy.actionKey)}
          onPress={() => void submit()}
        />
        {mode === 'signIn' ? (
          <>
            <SocialAuthButtons onBeforeAuthenticate={ensureConsent} />
            <AppButton
              label={t('forgotAction')}
              variant="secondary"
              onPress={() => navigate('auth.forgotPassword')}
            />
            <AppButton
              label={t('createAccountAction')}
              variant="secondary"
              onPress={() => navigate('auth.signUp')}
            />
          </>
        ) : null}
      </ScrollView>
      {/* 授权勾选固定在页面最底部（不随内容滚动/居中） */}
      {mode === 'signIn' || mode === 'signUp' || mode === 'phone' ? (
        <View style={authStyles.consentFooter}>
          <View style={authStyles.consentRow}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
              accessibilityLabel={t('consentCheckbox')}
              hitSlop={8}
              onPress={() => setAgreed((value) => !value)}
              style={authStyles.checkboxTarget}
            >
              <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                {agreed ? <View style={styles.checkboxMark} /> : null}
              </View>
            </Pressable>
            <Text
              style={[styles.caption, authStyles.consentText]}
              accessibilityRole="button"
              accessibilityLabel={t('consentCheckbox')}
              onPress={() => setAgreed((value) => !value)}
            >
              {t('consentPrefix')}
              <Text
                accessibilityRole="link"
                onPress={() => navigate('settings.termsOfService')}
                style={{ color: palette.brand }}
              >{t('termsLabel')}</Text>
              {t('conjunction')}
              <Text
                accessibilityRole="link"
                onPress={() => navigate('settings.privacyPolicy')}
                style={{ color: palette.brand }}
              >{t('privacyLabel')}</Text>
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

type AuthInput = Readonly<{
  mode: AuthMode;
  email: string;
  password: string;
  username: string;
  code: string;
  phone: string;
  phoneCodeSent: boolean;
}>;

function isValid(input: AuthInput) {
  const { mode, email, password, username, code, phone, phoneCodeSent } = input;
  if (mode === 'phone') {
    return /^\+[1-9]\d{7,14}$/.test(phone) && (!phoneCodeSent || /^\d{6}$/.test(code));
  }
  if (mode === 'verify') return /^\d{6}$/.test(code);
  if (mode === 'reset') return password.length >= 8;
  if (mode === 'signIn') return email.trim().length >= 2 && password.length > 0;
  if (!email.includes('@')) return false;
  if (mode === 'forgot') return true;
  if (mode === 'signUp' && username.trim().length < 2) return false;
  return password.length >= 8;
}

const authStyles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.x6, gap: spacing.x4 },
  copy: { gap: spacing.x2, marginBottom: spacing.x3 },
  consentFooter: {
    paddingHorizontal: spacing.x6,
    paddingBottom: spacing.x5,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.x1,
  },
  checkboxTarget: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  // flex:1：文本占据勾选框之外的剩余宽度、行内自然折行——
  // 否则长文本在 flexWrap 下会整块折到下一行，勾选框落单
  consentText: { flex: 1 },
  // 颜色随服务端色板（palette.brand / palette.error）在渲染处内联
  errorText: { fontSize: 13 },
});
