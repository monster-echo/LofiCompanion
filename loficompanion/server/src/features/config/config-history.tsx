import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';

export type Revision = Readonly<{ version: number; action: string; actor: string; createdAt: string }>;
export type AuditEntry = Readonly<{
  id: string; action: string; actor: string;
  fromVersion: number | null; toVersion: number; createdAt: string;
}>;

export function RevisionTable({ revisions }: Readonly<{ revisions: readonly Revision[] }>) {
  if (!revisions.length) return <EmptyRow text="暂无版本记录" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>版本</TableHead>
          <TableHead>操作</TableHead>
          <TableHead>操作者</TableHead>
          <TableHead>时间</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {revisions.map((revision) => (
          <TableRow key={revision.version}>
            <TableCell className="font-mono">v{revision.version}</TableCell>
            <TableCell><Badge variant="outline" className="gap-1"><History className="size-3" />{revision.action}</Badge></TableCell>
            <TableCell>{revision.actor}</TableCell>
            <TableCell className="text-muted-foreground">{formatDateTime(revision.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AuditTable({ audit }: Readonly<{ audit: readonly AuditEntry[] }>) {
  if (!audit.length) return <EmptyRow text="暂无审计记录" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>操作</TableHead>
          <TableHead>操作者</TableHead>
          <TableHead>版本变更</TableHead>
          <TableHead>时间</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {audit.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell><Badge variant="outline">{entry.action}</Badge></TableCell>
            <TableCell>{entry.actor}</TableCell>
            <TableCell className="font-mono text-xs">{entry.fromVersion ?? '—'} → v{entry.toVersion}</TableCell>
            <TableCell className="text-muted-foreground">{formatDateTime(entry.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EmptyRow({ text }: Readonly<{ text: string }>) {
  return <p className="text-muted-foreground py-6 text-center text-sm">{text}</p>;
}
