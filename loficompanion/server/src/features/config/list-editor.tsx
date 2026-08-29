'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** 通用数组 CRUD：每项一张子卡片，可编辑/删除，底部可新增。 */
export function ListEditor<T>({
  items,
  onChange,
  create,
  render,
  getKey,
  addLabel,
  itemTitle,
}: Readonly<{
  items: readonly T[];
  onChange: (next: T[]) => void;
  create: () => T;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => React.ReactNode;
  getKey: (item: T, index: number) => string;
  addLabel: string;
  itemTitle: (item: T, index: number) => string;
}>) {
  const update = (index: number, patch: Partial<T>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const add = () => onChange([...items, create()]);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <div key={getKey(item, index)} className="rounded-lg border p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{itemTitle(item, index)}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(index)}
              className="text-muted-foreground hover:text-destructive gap-1"
            >
              <Trash2 className="size-4" /> 删除
            </Button>
          </div>
          {render(item, (patch) => update(index, patch), index)}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1 self-start">
        <Plus className="size-4" /> {addLabel}
      </Button>
    </div>
  );
}
