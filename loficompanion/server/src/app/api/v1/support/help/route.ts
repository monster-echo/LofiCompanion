import { NextRequest } from 'next/server';
import { getClientContext } from '@/server/client-context';
import { getRuntimeConfig } from '@/server/database';
import { handleError, ok } from '@/server/http';

export async function GET(request: NextRequest) {
  try {
    const client = getClientContext(request);
    const support = (await getRuntimeConfig(client.appId, client.environment)).support;
    const preferred = support.help.filter((article) => article.locale === client.locale);
    const articles = preferred.length ? preferred : support.help.filter(
      (article) => article.locale === 'en-US',
    );
    return ok(articles);
  } catch (error) {
    return handleError(error);
  }
}
