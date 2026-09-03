import type { NextRequest } from 'next/server';
import { handleError, ok } from '@/lib/http';
import { listSkinProducts } from '@/features/store/data/product-repository';

export const dynamic = 'force-dynamic';

// 皮肤商品目录（docs/05 §8：价格只来自服务端，客户端不硬编码）。
// 公开路由——价格/权益键是目录展示数据，未登录可浏览（docs/08 S14）；
// 只含在售（active）商品，按上架时间排序。
export async function GET(_request: NextRequest) {
  try {
    const products = await listSkinProducts();
    return ok({ products });
  } catch (error) {
    return handleError(error);
  }
}
