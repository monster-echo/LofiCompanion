import { getRuntimeConfig } from './database';

export type PublicLegalDoc = Readonly<{
  type: string;
  locale: string;
  revision: string;
  title: string;
  content: string;
  requiresReconsent: boolean;
}>;

/**
 * Returns the published legal documents for an app. Public (no auth): used by
 * App Store policy links and the in-app legal viewer. Defaults to the
 * `production` environment since public links must reflect the released config.
 */
export async function getPublicLegal(
  appId: string,
  environment = 'production',
  type?: string,
  locale?: string,
): Promise<PublicLegalDoc[]> {
  const config = await getRuntimeConfig(appId, environment);
  return config.legal
    .filter((doc) => (type ? doc.type === type : true))
    .filter((doc) => (locale ? doc.locale === locale : true))
    .map((doc) => ({
      type: doc.type,
      locale: doc.locale,
      revision: doc.revision,
      title: doc.title,
      content: doc.content,
      requiresReconsent: doc.requiresReconsent,
    }));
}

/** Picks the best legal doc for a type: prefer the requested locale, else any. */
export async function findPublicLegal(
  appId: string,
  type: string,
  locale: string,
  environment = 'production',
): Promise<PublicLegalDoc | null> {
  return (await getPublicLegal(appId, environment, type, locale))[0]
    ?? (await getPublicLegal(appId, environment, type))[0]
    ?? null;
}
