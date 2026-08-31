-- 自习室弹幕表（WS 服务写入）。手动迁移：本地 DB 用户无 shadow database
-- 权限（P3014），以 prisma migrate deploy 应用。

-- CreateTable
CREATE TABLE "study_room_messages" (
    "id" SERIAL NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "study_room_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_room_messages_room_id_id_idx" ON "study_room_messages"("room_id", "id");
