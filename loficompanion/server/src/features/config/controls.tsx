'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** 字段容器：标签 + 说明 + 控件。每个配置项都用它，确保都有解释。 */
export function Field({
  label,
  description,
  htmlFor,
  children,
  className,
}: Readonly<{
  label: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {description ? (
        <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
      ) : null}
      {children}
    </div>
  );
}

type TextInputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> &
  Readonly<{ value: string; onChange: (value: string) => void }>;

export function TextInput({ value, onChange, ...props }: TextInputProps) {
  return <Input value={value} onChange={(event) => onChange(event.target.value)} {...props} />;
}

type NumberInputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> &
  Readonly<{ value: number; onChange: (value: number) => void }>;

export function NumberInput({ value, onChange, ...props }: NumberInputProps) {
  return (
    <Input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
      {...props}
    />
  );
}

export function SwitchInput({
  checked,
  onChange,
  id,
}: Readonly<{ checked: boolean; onChange: (checked: boolean) => void; id?: string }>) {
  return <Switch id={id} checked={checked} onCheckedChange={onChange} />;
}

export function SelectInput({
  value,
  onChange,
  options,
  id,
  placeholder,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  id?: string;
  placeholder?: string;
}>) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option} className="capitalize">{option}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ColorInput({
  value,
  onChange,
  id,
}: Readonly<{ value: string; onChange: (value: string) => void; id?: string }>) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-input size-9 cursor-pointer rounded-md border bg-transparent p-1"
        aria-label="取色器"
      />
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="max-w-32 font-mono text-sm" />
    </div>
  );
}

/** 多选（基于可选选项的芯片切换），用于 platforms / locales / entitlements 引用等。 */
export function ChipMultiSelect({
  options,
  selected,
  onChange,
}: Readonly<{
  options: readonly string[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}>) {
  const toggle = (option: string) => {
    onChange(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Button
            key={option}
            type="button"
            variant={active ? 'default' : 'outline'}
            size="sm"
            className="h-7 capitalize"
            onClick={() => toggle(option)}
          >
            {option}
          </Button>
        );
      })}
      {options.length === 0 ? <span className="text-muted-foreground text-xs">无可选项</span> : null}
    </div>
  );
}

/** 简单字符串列表编辑（用于 locales / categories 引用等）。 */
export function StringListEditor({
  values,
  onChange,
  placeholder,
}: Readonly<{ values: readonly string[]; onChange: (next: string[]) => void; placeholder?: string }>) {
  const [draft, setDraft] = React.useState('');
  const add = () => {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span key={value} className="bg-secondary text-secondary-foreground flex items-center gap-1 rounded-md px-2 py-1 text-xs">
            {value}
            <button type="button" onClick={() => onChange(values.filter((item) => item !== value))} aria-label={`移除 ${value}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
        <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1"><Plus className="size-4" />添加</Button>
      </div>
    </div>
  );
}
