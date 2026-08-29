import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findPublicLegal } from '@/server/public-legal';
import { DEFAULT_APP_ID } from '@/server/service-identity';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<Readonly<{ type: string }>>;
  searchParams: Promise<Readonly<Record<string, string | readonly string[]>>>;
};

function readString(value: string | readonly string[] | undefined, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { type } = await params;
  const sp = await searchParams;
  const appId = readString(sp.app, DEFAULT_APP_ID);
  const locale = readString(sp.locale, 'zh-CN');
  const doc = await findPublicLegal(appId, type, locale);
  return { title: doc?.title ?? '法务文档' };
}

export default async function LegalPage({ params, searchParams }: Props) {
  const { type } = await params;
  const sp = await searchParams;
  const appId = readString(sp.app, DEFAULT_APP_ID);
  const locale = readString(sp.locale, 'zh-CN');
  const doc = await findPublicLegal(appId, type, locale);
  if (!doc) notFound();

  return (
    <main className="bg-background text-foreground min-h-svh">
      <article className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-muted-foreground text-xs tracking-widest uppercase">
          {labelFor(doc.type)} · {doc.locale}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          版本 {doc.revision} · 应用 {appId}
        </p>
        <div className="mt-6 text-sm leading-relaxed whitespace-pre-line">
          {doc.content}
        </div>
      </article>
    </main>
  );
}

function labelFor(type: string) {
  const labels: Readonly<Record<string, string>> = {
    privacy: '隐私政策',
    terms: '用户协议',
    subscription: '订阅说明',
  };
  return labels[type] ?? '法务文档';
}
