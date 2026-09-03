-- 皮肤商店域自基础设施 auth 迁入（P4 退役 lofi-server）：商品行/订单/所有权三表。
-- 手写 SQL：本地 DB 用户无 shadow database 权限（P3014），以 prisma migrate deploy 应用。

-- CreateTable
CREATE TABLE "skin_products" (
    "id" TEXT NOT NULL,
    "skin_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "skin_name" TEXT NOT NULL,
    "access_type" TEXT NOT NULL DEFAULT 'paid',
    "entitlement_key" TEXT NOT NULL,
    "store_product_ids" TEXT NOT NULL DEFAULT '{}',
    "price_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'active',
    "provider" TEXT NOT NULL DEFAULT 'store',
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "skin_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skin_orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "skin_id" TEXT NOT NULL,
    "entitlement_key" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "store_product_id" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "store_transaction_id" TEXT NOT NULL DEFAULT '',
    "receipt_hash" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT NOT NULL,
    "completed_at" TEXT,

    CONSTRAINT "skin_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skin_entitlements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "entitlement_key" TEXT NOT NULL,
    "source_order_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TEXT,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "skin_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skin_products_skin_id_key" ON "skin_products"("skin_id");

-- CreateIndex
CREATE UNIQUE INDEX "skin_orders_user_id_idempotency_key_key" ON "skin_orders"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "skin_orders_user_id_status_idx" ON "skin_orders"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "skin_entitlements_user_id_entitlement_key_key" ON "skin_entitlements"("user_id", "entitlement_key");
