import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppButton } from '../design-system/components';
import { SelectField } from '../design-system/SelectField';
import { useApp } from '../state/AppStore';
import { FeedbackScreenshots } from '../support/FeedbackScreenshots';
import type { FeedbackScreenshot } from '../support/FeedbackScreenshots';
import { useSupport } from '../support/SupportStore';
import { usePreferences } from '../preferences/PreferencesProvider';
import { styles } from '../theme/styles';
import { SupportPage } from './SupportScreens';

export function NewTicketScreen() {
  const { t } = useTranslation('support');
  const { config } = useApp();
  const { palette } = usePreferences();
  const { busy, createTicket } = useSupport();
  const [category, setCategory] = useState(config.support.categories[0]?.id ?? 'technical');
  const [severity, setSeverity] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const valid = subject.trim().length >= 4 && message.trim().length >= 4;
  return (
    <SupportPage title={t('contactSupport')}>
      <Text style={styles.heading}>{t('newTicketHeading')}</Text>
      <Text style={styles.secondary}>{t('newTicketIntro')}</Text>
      <TextInput
        accessibilityLabel={t('labelSubject')}
        maxLength={100}
        onChangeText={setSubject}
        placeholder={t('placeholderSubject')}
        placeholderTextColor={palette.placeholder}
        style={styles.input}
        value={subject}
      />
      <TextInput
        accessibilityLabel={t('labelDetail')}
        maxLength={2000}
        multiline
        onChangeText={setMessage}
        placeholder={t('placeholderDetail')}
        placeholderTextColor={palette.placeholder}
        style={styles.input}
        textAlignVertical="top"
        value={message}
      />
      <Text style={styles.sectionLabel}>{t('optionalInfo')}</Text>
      <SelectField
        label={t('labelCategory')}
        onChange={setCategory}
        options={config.support.categories.map((item) => ({
          value: item.id,
          label: item.label,
        }))}
        value={category}
      />
      <SelectField
        label={t('labelSeverity')}
        onChange={setSeverity}
        options={[
          { value: 'normal', label: t('severityNormal') },
          { value: 'high', label: t('severityHigh') },
          { value: 'urgent', label: t('severityUrgent') },
        ]}
        value={severity}
      />
      <AppButton
        disabled={!valid || busy}
        icon="check"
        label={busy ? t('submitting') : t('submitTicket')}
        onPress={() => void createTicket({ category, severity, subject, message })}
      />
    </SupportPage>
  );
}

export function ProductFeedbackScreen() {
  const { t } = useTranslation('support');
  const { back } = useApp();
  const { palette } = usePreferences();
  const { busy, submitFeedback } = useSupport();
  const [category, setCategory] = useState<
    'suggestion' | 'experience' | 'feature_request' | 'other'
  >('suggestion');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [rating, setRating] = useState(5);
  const [screenshots, setScreenshots] = useState<readonly FeedbackScreenshot[]>([]);
  const submit = async () => {
    if (await submitFeedback({ category, title, body, rating, screenshots })) back();
  };
  const categories = [
    ['suggestion', t('categorySuggestion')], ['experience', t('categoryExperience')],
    ['feature_request', t('categoryFeatureRequest')], ['other', t('categoryOther')],
  ] as const;
  return (
    <SupportPage title={t('productFeedback')}>
      <Text style={styles.heading}>{t('feedbackHeading')}</Text>
      <Text style={styles.secondary}>{t('feedbackIntro')}</Text>
      <TextInput
        accessibilityLabel={t('labelFeedbackTitle')}
        maxLength={100}
        onChangeText={setTitle}
        placeholder={t('placeholderFeedbackTitle')}
        placeholderTextColor={palette.placeholder}
        style={styles.input}
        value={title}
      />
      <TextInput
        accessibilityLabel={t('labelFeedbackBody')}
        maxLength={3000}
        multiline
        onChangeText={setBody}
        placeholder={t('placeholderFeedbackBody')}
        placeholderTextColor={palette.placeholder}
        style={styles.input}
        textAlignVertical="top"
        value={body}
      />
      <FeedbackScreenshots value={screenshots} onChange={setScreenshots} />
      <Text style={styles.sectionLabel}>{t('optionalInfo')}</Text>
      <SelectField
        label={t('labelFeedbackType')}
        onChange={setCategory}
        options={categories.map(([value, label]) => ({ value, label }))}
        value={category}
      />
      <SelectField
        label={t('labelRating')}
        onChange={setRating}
        options={[5, 4, 3, 2, 1].map((value) => ({
          value,
          label: t('ratingOption', { n: value }),
        }))}
        value={rating}
      />
      <AppButton
        disabled={busy || title.trim().length < 4 || body.trim().length < 4}
        icon="check"
        label={busy ? t('submitting') : t('submitFeedback')}
        onPress={() => void submit()}
      />
    </SupportPage>
  );
}
