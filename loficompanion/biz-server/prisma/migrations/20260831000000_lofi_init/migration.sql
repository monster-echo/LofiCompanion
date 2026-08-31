-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "focus_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "installation_id" TEXT,
    "activity" TEXT NOT NULL,
    "planned_seconds" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TEXT NOT NULL,
    "ended_at" TEXT,
    "effective_seconds" INTEGER NOT NULL DEFAULT 0,
    "pauses" TEXT NOT NULL DEFAULT '[]',
    "client_request_id" TEXT NOT NULL,
    "rule_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "focus_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "response_body" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key","user_id","endpoint")
);

-- CreateTable
CREATE TABLE "achievement_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rule_key" TEXT NOT NULL,
    "rule_version" INTEGER NOT NULL DEFAULT 1,
    "source_session_id" TEXT,
    "granted_at" TEXT NOT NULL,

    CONSTRAINT "achievement_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_items" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source_rule_key" TEXT NOT NULL,

    CONSTRAINT "room_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_room_items" (
    "user_id" TEXT NOT NULL,
    "room_item_id" TEXT NOT NULL,
    "source_grant_id" TEXT,
    "unlocked_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "friend_invitations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "friend_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "friend_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "join_code" TEXT NOT NULL,
    "weekly_goal_minutes" INTEGER NOT NULL DEFAULT 600,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "study_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "leaderboard_scores" (
    "user_id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "week_id" TEXT NOT NULL,
    "effective_seconds" INTEGER NOT NULL DEFAULT 0,
    "session_count" INTEGER NOT NULL DEFAULT 0,
    "rule_version" INTEGER NOT NULL DEFAULT 2,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "leaderboard_scores_pkey" PRIMARY KEY ("user_id","scope_type","scope_id","week_id","rule_version")
);

-- CreateTable
CREATE TABLE "leaderboard_snapshots" (
    "id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "week_id" TEXT NOT NULL,
    "rankings" TEXT NOT NULL,
    "settled_at" TEXT NOT NULL,
    "rule_version" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "leaderboard_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_settings" (
    "user_id" TEXT NOT NULL,
    "public_display" INTEGER NOT NULL DEFAULT 1,
    "opted_out" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "leaderboard_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "skins" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "access_type" TEXT NOT NULL DEFAULT 'free',
    "manifest_version" INTEGER NOT NULL DEFAULT 1,
    "moderation_status" TEXT NOT NULL DEFAULT 'approved',
    "published_at" TEXT,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "skins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skin_manifests" (
    "id" TEXT NOT NULL,
    "skin_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "manifest" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "skin_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "focus_sessions_user_id_started_at_idx" ON "focus_sessions"("user_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "focus_sessions_user_id_client_request_id_key" ON "focus_sessions"("user_id", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "achievement_grants_user_id_rule_key_rule_version_key" ON "achievement_grants"("user_id", "rule_key", "rule_version");

-- CreateIndex
CREATE UNIQUE INDEX "room_items_item_id_key" ON "room_items"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_room_items_user_id_room_item_id_key" ON "user_room_items"("user_id", "room_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "friend_invitations_user_id_key" ON "friend_invitations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "friend_invitations_code_key" ON "friend_invitations"("code");

-- CreateIndex
CREATE INDEX "friendships_friend_id_idx" ON "friendships"("friend_id");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_user_id_friend_id_key" ON "friendships"("user_id", "friend_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_groups_join_code_key" ON "study_groups"("join_code");

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "group_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_group_id_user_id_key" ON "group_members"("group_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_snapshots_scope_type_scope_id_week_id_rule_vers_key" ON "leaderboard_snapshots"("scope_type", "scope_id", "week_id", "rule_version");

-- CreateIndex
CREATE UNIQUE INDEX "skins_slug_key" ON "skins"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "skin_manifests_skin_id_version_key" ON "skin_manifests"("skin_id", "version");

-- AddForeignKey
ALTER TABLE "skin_manifests" ADD CONSTRAINT "skin_manifests_skin_id_fkey" FOREIGN KEY ("skin_id") REFERENCES "skins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

