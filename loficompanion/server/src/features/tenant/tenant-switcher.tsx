'use client';

import { Building2, Lock } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ENVIRONMENTS, useTenant } from './tenant-context';

export function TenantSwitcher() {
  const { appId, environment, setScope } = useTenant();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Building2 className="text-muted-foreground size-4" aria-hidden />
      <Select value={appId} disabled>
        <SelectTrigger size="sm" className="w-44 gap-2" aria-label="当前应用（登录时锁定）">
          <Lock className="size-3.5 opacity-50" aria-hidden />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={appId}>{appId}</SelectItem>
        </SelectContent>
      </Select>
      <span className="text-muted-foreground" aria-hidden>·</span>
      <Select
        value={environment}
        onValueChange={(value) => setScope({ environment: value })}
      >
        <SelectTrigger size="sm" className="w-36 capitalize" aria-label="选择环境">
          <SelectValue placeholder="环境" />
        </SelectTrigger>
        <SelectContent>
          {ENVIRONMENTS.map((env) => (
            <SelectItem key={env} value={env} className="capitalize">
              {env}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
