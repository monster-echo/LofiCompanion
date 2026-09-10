-- 皮肤商品行：限时发售窗口 + Plus 会员价（全可空=常态无窗口/无折扣）。
-- 手写 SQL：本地 DB 用户无 shadow database 权限（P3014），以 prisma migrate deploy 应用。

-- AlterTable
ALTER TABLE "skin_products" ADD COLUMN "available_from" TEXT;
ALTER TABLE "skin_products" ADD COLUMN "available_until" TEXT;
ALTER TABLE "skin_products" ADD COLUMN "plus_price_minor" INTEGER;
