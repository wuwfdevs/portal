import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Story embeddings (ROADMAP: Vector search and similar stories): one pgvector row per WUWF story, for semantic search and
 * "similar stories". The table is declared in src/db/storyEmbeddings.ts. `vector` must be available on the server: on Supabase
 * enable it on the project first (Database > Extensions); a plain Postgres needs pgvector installed (docker-compose.yml uses the
 * pgvector image). `down` leaves the extension in place: other tables may use it.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`)
  await db.execute(sql`
   CREATE TABLE "story_embeddings" (
  	"post_id" integer PRIMARY KEY NOT NULL,
  	"embedding" vector(1536) NOT NULL,
  	"model" text NOT NULL,
  	"content_hash" text NOT NULL,
  	"embedded_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "story_embeddings" ADD CONSTRAINT "story_embeddings_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "story_embeddings_embedding_hnsw" ON "story_embeddings" USING hnsw ("embedding" vector_cosine_ops);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "story_embeddings" CASCADE;`)
}
