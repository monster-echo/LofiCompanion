import {
  Activity,
  AppWindow,
  LayoutDashboard,
  ScrollText,
  Settings2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { routes } from '@/lib/routes';

export type NavItem = Readonly<{
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}>;

export const navItems: readonly NavItem[] = [
  {
    href: routes.overview,
    label: '概览',
    description: '租户总体状态与关键指标',
    icon: LayoutDashboard,
  },
  {
    href: routes.config,
    label: '多租户配置',
    description: '草稿编辑、发布、版本与审计',
    icon: Settings2,
  },
  {
    href: routes.logs,
    label: '日志与分析',
    description: '遥测事件检索与趋势分析',
    icon: ScrollText,
  },
  {
    href: routes.online,
    label: '在线人数',
    description: '实时在线会话与趋势',
    icon: Users,
  },
  {
    href: routes.apps,
    label: '应用管理',
    description: '多应用与多环境注册表',
    icon: AppWindow,
  },
] as const;

export const brandIcon = Activity;
