import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  AppButton, AppCard, ListRow, OfflineBanner, PageHeader,
} from '../design-system/components';
import { AsyncState } from '../state/asyncState';
import { useApp } from '../state/AppStore';
import { useSupport } from '../support/SupportStore';
import { styles } from '../theme/styles';
import { spacing } from '../theme/tokens';

export function SupportHomeScreen() {
  const { t } = useTranslation('support');
  const { navigate } = useApp();
  const { help, tickets, loadHome, openTicket } = useSupport();
  useEffect(() => { void loadHome(); }, [loadHome]);
  return (
    <View style={styles.page}>
      <OfflineBanner />
      <PageHeader title={t('homeTitle')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={localStyles.actions}>
          <AppButton
            analyticsId="support.new_ticket"
            icon="bell"
            label={t('contactSupport')}
            onPress={() => navigate('support.newTicket')}
          />
          <AppButton
            analyticsId="support.feedback"
            label={t('productFeedback')}
            onPress={() => navigate('support.feedback')}
            variant="secondary"
          />
        </View>
        <Text style={styles.sectionLabel}>{t('myTickets')}</Text>
        <TicketList state={tickets} onOpen={(id) => void openTicket(id)} />
        <Text style={styles.sectionLabel}>{t('faq')}</Text>
        <HelpList state={help} onRetry={() => void loadHome()} />
      </ScrollView>
    </View>
  );
}

export function TicketDetailScreen() {
  const { t } = useTranslation('support');
  const { detail, busy, reply } = useSupport();
  const [message, setMessage] = useState('');
  if (detail.status !== 'success') {
    return (
      <View style={styles.page}>
        <PageHeader title={t('ticketDetailTitle')} />
        <StateMessage state={detail} />
      </View>
    );
  }
  const send = async () => {
    if (await reply(message)) setMessage('');
  };
  return (
    <SupportPage title={t('ticketDetailTitle')}>
      <AppCard>
        <Text style={styles.heading}>{detail.data.subject}</Text>
        <Text style={styles.caption}>
          {statusLabel(detail.data.status, t)} · {detail.data.queueId}
        </Text>
      </AppCard>
      {detail.data.messages.map((item) => (
        <AppCard key={item.id}>
          <Text style={styles.caption}>
            {item.authorType === 'user' ? t('authorUser') : t('authorSupport')} · {formatDate(item.createdAt)}
          </Text>
          <Text style={styles.body}>{item.body}</Text>
        </AppCard>
      ))}
      <TextInput
        accessibilityLabel={t('labelReply')}
        maxLength={2000}
        multiline
        onChangeText={setMessage}
        placeholder={t('placeholderReply')}
        style={[styles.input, localStyles.multiline]}
        textAlignVertical="top"
        value={message}
      />
      <AppButton
        disabled={busy || !message.trim()}
        label={busy ? t('sending') : t('sendReply')}
        onPress={() => void send()}
      />
    </SupportPage>
  );
}

export function SupportPage({ title, children }: Readonly<{
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <View style={styles.page}>
      <OfflineBanner />
      <PageHeader title={title} />
      <ScrollView contentContainerStyle={styles.scrollContent}>{children}</ScrollView>
    </View>
  );
}

function TicketList({ state, onOpen }: Readonly<{
  state: AsyncState<readonly { id: string; subject: string; status: string }[]>;
  onOpen: (id: string) => void;
}>) {
  const { t } = useTranslation('support');
  if (state.status !== 'success') return <StateMessage state={state} />;
  return (
    <AppCard>
      {state.data.map((ticket) => (
        <ListRow
          key={ticket.id}
          label={ticket.subject}
          onPress={() => onOpen(ticket.id)}
          value={statusLabel(ticket.status, t)}
        />
      ))}
    </AppCard>
  );
}

function HelpList({ state, onRetry }: Readonly<{
  state: AsyncState<readonly { id: string; title: string; body: string }[]>;
  onRetry: () => void;
}>) {
  if (state.status !== 'success') return <StateMessage state={state} onRetry={onRetry} />;
  return <>{state.data.map((article) => (
    <AppCard key={article.id}>
      <Text style={styles.heading}>{article.title}</Text>
      <Text style={styles.body}>{article.body}</Text>
    </AppCard>
  ))}</>;
}

function StateMessage<T>({ state, onRetry }: Readonly<{
  state: AsyncState<T>;
  onRetry?: () => void;
}>) {
  const { t } = useTranslation('support');
  const message = state.status === 'loading' ? t('loading')
    : state.status === 'empty' ? t('empty')
      : state.status === 'error' ? state.message : t('reopenTicket');
  return (
    <AppCard>
      <Text style={styles.secondary}>{message}</Text>
      {onRetry && state.status === 'error'
        ? <AppButton label={t('retry')} onPress={onRetry} variant="secondary" /> : null}
    </AppCard>
  );
}

function statusLabel(status: string, t: TFunction<'support'>) {
  return {
    submitted: t('statusSubmitted'), triaged: t('statusTriaged'), in_progress: t('statusInProgress'),
    waiting_for_user: t('statusWaitingForUser'), waiting_for_support: t('statusWaitingForSupport'),
    resolved: t('statusResolved'), closed: t('statusClosed'),
  }[status] ?? status;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

const localStyles = StyleSheet.create({
  actions: { gap: spacing.x3 },
  multiline: { minHeight: 132, paddingTop: spacing.x4 },
});
