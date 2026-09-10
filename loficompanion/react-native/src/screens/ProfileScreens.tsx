import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  AppButton,
  AppCard,
  KeyboardAvoidingScreen,
  ListRow,
  OfflineBanner,
  PageHeader,
} from '../design-system/components';
import { useApp } from '../state/AppStore';
import { tierDisplaySummary } from '../domain/membershipCopy';
import { AvatarCropEditor } from '../profile/AvatarCropEditor';
import { ProfileIdentityCard, ResolvedAvatar } from '../profile/ProfileIdentityCard';
import { usePreferences } from '../preferences/PreferencesProvider';
import { radii, spacing } from '../theme/tokens';
import { styles } from '../theme/styles';
import { useTranslation } from 'react-i18next';

export function ProfileScreen() {
  const { user, config, navigate, signOut, showConfirm, replace } = useApp();
  const { palette } = usePreferences();
  const { t } = useTranslation('profile');
  const { t: tMembership } = useTranslation('membership');
  const insets = useSafeAreaInsets();
  // 访客直达登录页（产品决策 2026-08-31：中间「登录后同步」页增加操作步骤、
  // 造成流失）。replace 语义保证登录页无返回入口，登录成功后由
  // onAuthenticated 复位到首页。
  useEffect(() => {
    if (!user) replace('auth.signIn');
  }, [user, replace]);
  if (!user) return null;
  const tier = config.tiers.find((item) => item.id === user.tierId);
  const requestSignOut = () => showConfirm({
    title: t('signOutConfirmTitle'),
    message: t('signOutConfirmMessage'),
    confirmLabel: t('signOutConfirmAction'),
    onConfirm: signOut,
  });
  return (
    <View style={styles.page}>
      <OfflineBanner />
      {/* Tab 根页不设标题栏/返回键（悬浮 Tab 已表达语义）；设置入口在下方列表 */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          // 顶部自行避让状态栏（全局垫充已移除）；悬浮 Tab 覆盖场景底部：
          // 尾部留白保证「退出登录」可点
          {
            paddingTop: spacing.x4 + insets.top,
            paddingBottom: Math.max(insets.bottom + spacing.x6, 104),
          },
        ]}
      >
        <ProfileIdentityCard
          displayName={user.displayName}
          username={user.username}
          email={user.hasEmail && user.email ? user.email : null}
          bio={user.bio}
          avatarUrl={user.avatarUrl}
        />
        <View
          style={[
            profileStyles.membership,
            { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
          ]}
        >
          <Text style={[profileStyles.membershipTitle, { color: palette.text }]}>
            {tier?.name ?? user.tierId}
          </Text>
          <Text style={[profileStyles.membershipText, { color: palette.textSecondary }]}>
            {tier ? tierDisplaySummary(tier, tMembership) : t('membershipFallback')}
          </Text>
          <AppButton
            label={t('viewMembershipPerks')}
            icon="crown"
            onPress={() => navigate('membership.home')}
          />
        </View>
        <AppCard>
          <ListRow label={t('rowProfile')} route="profile.edit" icon="user" />
          {config.features.statistics ? (
            <ListRow label={t('rowStatistics')} route="profile.statistics" icon="home" />
          ) : null}
          {config.features.coupons ? (
            <ListRow label={t('rowCoupons')} route="profile.coupons" icon="gift" />
          ) : null}
          {config.features.invites ? (
            <ListRow label={t('rowInvite')} route="profile.invite" icon="gift" />
          ) : null}
          <ListRow label={t('rowOrders')} route="membership.orders" icon="crown" />
          <ListRow label={t('rowSettings')} route="settings.home" icon="settings" />
        </AppCard>
        <AppButton label={t('signOutAction')} variant="danger" onPress={requestSignOut} />
      </ScrollView>
    </View>
  );
}

function SignedOutProfile() {
  const { navigate } = useApp();
  const { t } = useTranslation('profile');
  return (
    <View style={styles.page}>
      <PageHeader title={t('tabMine')} />
      <View style={styles.centered}>
        <ResolvedAvatar avatarUrl={null} label="M" size={56} />
        <Text style={styles.title}>{t('signedOutTitle')}</Text>
        <Text style={styles.secondary}>{t('signedOutHint')}</Text>
        <View style={profileStyles.fullWidth}>
          <AppButton label={t('signInOrRegister')} onPress={() => navigate('auth.signIn')} />
        </View>
      </View>
    </View>
  );
}

export function EditProfileScreen() {
  const { user, updateProfile, busy, showToast } = useApp();
  const { palette } = usePreferences();
  const { t } = useTranslation('profile');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');
  const [cropAsset, setCropAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const chooseAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast(t('galleryPermissionRequired'), 'error');
      return;
    }
    const selection = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    const asset = selection.assets?.[0];
    if (selection.canceled || !asset) return;
    setCropAsset(asset);
  };
  const save = async () => {
    if (await updateProfile({ displayName, bio, avatarUrl: avatarUrl || null })) {
      showToast(t('profileSaved'), 'success');
    }
  };
  return (
    <KeyboardAvoidingScreen style={styles.page}>
      <PageHeader title={t('rowProfile')} />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.scrollContent}
      >
        <ProfileIdentityCard
          displayName={displayName || user?.username || 'M'}
          username={user?.username ?? ''}
          email={user?.hasEmail && user?.email ? user.email : null}
          bio={bio}
          avatarUrl={avatarUrl}
          onAvatarPress={() => void chooseAvatar()}
        />
        <Text style={styles.sectionLabel}>{t('usernameFixed')}</Text>
        <Text style={styles.secondary}>@{user?.username}</Text>
        <Text style={styles.sectionLabel}>{t('displayNameLabel')}</Text>
        <TextInput
          accessibilityLabel={t('displayNameLabel')}
          maxLength={40}
          onChangeText={setDisplayName}
          style={styles.input}
          value={displayName}
        />
        <Text style={styles.sectionLabel}>{t('bioLabel')}</Text>
        <TextInput
          accessibilityLabel={t('bioLabel')}
          maxLength={160}
          multiline
          onChangeText={setBio}
          placeholder={t('bioPlaceholder')}
          placeholderTextColor={palette.placeholder}
          style={[styles.input, profileStyles.bioInput]}
          value={bio}
        />
        <AppButton
          disabled={busy}
          label={busy ? t('saving') : t('saveProfile')}
          icon="check"
          onPress={() => void save()}
        />
      </ScrollView>
      {cropAsset ? (
        <AvatarCropEditor
          asset={cropAsset}
          onCancel={() => setCropAsset(null)}
          onConfirm={(value) => {
            setAvatarUrl(value);
            setCropAsset(null);
          }}
        />
      ) : null}
    </KeyboardAvoidingScreen>
  );
}

// 颜色一律渲染时由 palette 注入（服务端色板可覆盖）；此处只保留布局常量。
const profileStyles = StyleSheet.create({
  fullWidth: { width: '100%' },
  bioInput: { minHeight: 96, textAlignVertical: 'top' },
  membership: {
    borderRadius: radii.card,
    padding: spacing.x5,
    gap: spacing.x3,
    borderWidth: 1,
  },
  membershipTitle: { fontSize: 22, fontWeight: '700' },
  membershipText: { fontSize: 14 },
});
