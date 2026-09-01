import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppCard, ListRow, PageHeader } from '../design-system/components';
import {
  LegalDocument,
  privacyPolicy,
  subscriptionTerms,
  termsOfService,
} from '../legal/legalDocuments';
import { useApp } from '../state/AppStore';
import { usePreferences } from '../preferences/PreferencesProvider';
import { useTranslation } from 'react-i18next';
import { styles } from '../theme/styles';
import { radii, spacing } from '../theme/tokens';

type LegalType = 'privacy' | 'terms' | 'subscription';

/** 解析后的法务文档：服务端（locale 匹配）优先，回落内置中文文书。 */
interface ResolvedLegal {
  title: string;
  /** 结构化段落（内置文书）；服务端 content 按空行切分为平铺段落 */
  sections: ReadonlyArray<{ title: string; paragraphs: readonly string[] }>;
  revision: string;
  localeTag: 'zh-CN' | 'en-US';
}

function useResolvedLegal(type: LegalType): ResolvedLegal {
  const { config } = useApp();
  const { locale } = usePreferences();
  const entry = config.legal.find((doc) => doc.type === type && doc.locale === locale)
    ?? config.legal.find((doc) => doc.type === type && doc.locale === 'zh-CN');
  if (entry) {
    return {
      title: entry.title,
      revision: entry.revision,
      localeTag: entry.locale,
      sections: [{
        title: '',
        paragraphs: entry.content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
      }],
    };
  }
  const bundled: LegalDocument =
    type === 'privacy' ? privacyPolicy
      : type === 'terms' ? termsOfService
        : subscriptionTerms;
  return {
    title: bundled.title,
    revision: '2026-07-30',
    localeTag: 'zh-CN',
    sections: bundled.sections.map((section) => ({
      title: section.title,
      paragraphs: section.bullets ? [...section.paragraphs, ...section.bullets] : section.paragraphs,
    })),
  };
}

export function LegalIndexScreen() {
  const { t } = useTranslation('legal');
  return (
    <View style={styles.page}>
      <PageHeader title={t('indexTitle')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.heading}>{t('indexIntro')}</Text>
        <Text style={styles.secondary}>{t('indexHeading')}</Text>
        <AppCard>
          <ListRow label={t('privacyLabel')} route="settings.privacyPolicy" value={t('privacyValue')} />
          <ListRow label={t('termsLabel')} route="settings.termsOfService" value={t('termsValue')} />
          <ListRow label={t('subscriptionLabel')} route="settings.subscriptionTerms" value={t('subscriptionValue')} />
        </AppCard>
      </ScrollView>
    </View>
  );
}

export function PrivacyPolicyScreen() {
  return <LegalDocumentScreen type="privacy" />;
}

export function TermsOfServiceScreen() {
  return <LegalDocumentScreen type="terms" />;
}

export function SubscriptionTermsScreen() {
  return <LegalDocumentScreen type="subscription" />;
}

function LegalDocumentScreen({ type }: Readonly<{ type: LegalType }>) {
  const { palette } = usePreferences();
  const { t } = useTranslation('legal');
  const doc = useResolvedLegal(type);
  return (
    <View style={styles.page}>
      <PageHeader title={doc.title} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[legalStyles.hero, { backgroundColor: palette.brandSoft }]}>
          <Text style={styles.title}>{doc.title}</Text>
          <Text style={styles.secondary}>{t('versionLine', { revision: doc.revision, locale: doc.localeTag })}</Text>
        </View>
        {doc.sections.map((section, index) => (
          <View key={`${section.title}-${index}`} style={legalStyles.section}>
            {section.title !== '' ? <Text style={styles.heading}>{section.title}</Text> : null}
            {section.paragraphs.map((paragraph, pIndex) => (
              <Text key={`${index}-${pIndex}`} style={[styles.body, legalStyles.copy]}>{paragraph}</Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const legalStyles = StyleSheet.create({
  hero: {
    borderRadius: radii.card,
    padding: spacing.x5,
    gap: spacing.x3,
  },
  section: { gap: spacing.x3, paddingVertical: spacing.x2 },
  copy: { lineHeight: 25 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.x3 },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: radii.round,
    marginTop: 9,
  },
  bulletText: { flex: 1, lineHeight: 25 },
});
