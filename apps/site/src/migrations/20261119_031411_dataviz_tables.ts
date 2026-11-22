import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_visualizations_table_columns_format_style" AS ENUM('number', 'percent', 'currency');
  CREATE TYPE "public"."enum_visualizations_kind" AS ENUM('chart', 'map', 'table', 'embed');
  CREATE TYPE "public"."enum_visualizations_data_mode" AS ENUM('latest', 'pinned');
  CREATE TYPE "public"."enum_visualizations_chart_type" AS ENUM('line', 'area', 'column', 'bar', 'scatter');
  CREATE TYPE "public"."enum_visualizations_chart_y_format_style" AS ENUM('number', 'percent', 'currency');
  CREATE TYPE "public"."enum_visualizations_chart_sort" AS ENUM('data', 'valueDesc', 'valueAsc');
  CREATE TYPE "public"."enum_visualizations_map_geometry" AS ENUM('boundaries', 'dataset', 'points');
  CREATE TYPE "public"."enum_visualizations_map_value_format_style" AS ENUM('number', 'percent', 'currency');
  CREATE TYPE "public"."enum_visualizations_table_sort_direction" AS ENUM('asc', 'desc');
  CREATE TYPE "public"."enum_visualizations_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__visualizations_v_version_table_columns_format_style" AS ENUM('number', 'percent', 'currency');
  CREATE TYPE "public"."enum__visualizations_v_version_kind" AS ENUM('chart', 'map', 'table', 'embed');
  CREATE TYPE "public"."enum__visualizations_v_version_data_mode" AS ENUM('latest', 'pinned');
  CREATE TYPE "public"."enum__visualizations_v_version_chart_type" AS ENUM('line', 'area', 'column', 'bar', 'scatter');
  CREATE TYPE "public"."enum__visualizations_v_version_chart_y_format_style" AS ENUM('number', 'percent', 'currency');
  CREATE TYPE "public"."enum__visualizations_v_version_chart_sort" AS ENUM('data', 'valueDesc', 'valueAsc');
  CREATE TYPE "public"."enum__visualizations_v_version_map_geometry" AS ENUM('boundaries', 'dataset', 'points');
  CREATE TYPE "public"."enum__visualizations_v_version_map_value_format_style" AS ENUM('number', 'percent', 'currency');
  CREATE TYPE "public"."enum__visualizations_v_version_table_sort_direction" AS ENUM('asc', 'desc');
  CREATE TYPE "public"."enum__visualizations_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_dataset_versions_format" AS ENUM('csv', 'json', 'geojson');
  CREATE TABLE "visualizations_table_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"column" varchar,
  	"label" varchar,
  	"format_style" "enum_visualizations_table_columns_format_style" DEFAULT 'number',
  	"format_decimals" numeric,
  	"format_compact" boolean DEFAULT false,
  	"format_prefix" varchar,
  	"format_suffix" varchar
  );
  
  CREATE TABLE "visualizations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"kind" "enum_visualizations_kind" DEFAULT 'chart',
  	"dataset_id" integer,
  	"data_mode" "enum_visualizations_data_mode" DEFAULT 'latest',
  	"pinned_version_id" integer,
  	"chart_type" "enum_visualizations_chart_type" DEFAULT 'line',
  	"chart_x" varchar,
  	"chart_series" varchar,
  	"chart_x_label" varchar,
  	"chart_y_label" varchar,
  	"chart_y_format_style" "enum_visualizations_chart_y_format_style" DEFAULT 'number',
  	"chart_y_format_decimals" numeric,
  	"chart_y_format_compact" boolean DEFAULT false,
  	"chart_y_format_prefix" varchar,
  	"chart_y_format_suffix" varchar,
  	"chart_zero_baseline" boolean,
  	"chart_sort" "enum_visualizations_chart_sort" DEFAULT 'data',
  	"map_geometry" "enum_visualizations_map_geometry" DEFAULT 'boundaries',
  	"map_boundary_dataset_id" integer,
  	"map_boundary_version_id" integer,
  	"map_join_column" varchar,
  	"map_boundary_key" varchar,
  	"map_lat_column" varchar,
  	"map_lon_column" varchar,
  	"map_value_column" varchar,
  	"map_label_column" varchar,
  	"map_classes" numeric DEFAULT 5,
  	"map_legend_title" varchar,
  	"map_value_format_style" "enum_visualizations_map_value_format_style" DEFAULT 'number',
  	"map_value_format_decimals" numeric,
  	"map_value_format_compact" boolean DEFAULT false,
  	"map_value_format_prefix" varchar,
  	"map_value_format_suffix" varchar,
  	"map_interactive" boolean DEFAULT false,
  	"table_sort_column" varchar,
  	"table_sort_direction" "enum_visualizations_table_sort_direction" DEFAULT 'asc',
  	"table_searchable" boolean DEFAULT false,
  	"table_page_size" numeric DEFAULT 25,
  	"embed_url" varchar,
  	"embed_width" numeric,
  	"embed_height" numeric,
  	"caption" varchar,
  	"alt_text" varchar,
  	"source_name" varchar,
  	"source_url" varchar,
  	"notes" varchar,
  	"show_download" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_visualizations_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "visualizations_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_visualizations_v_version_table_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"column" varchar,
  	"label" varchar,
  	"format_style" "enum__visualizations_v_version_table_columns_format_style" DEFAULT 'number',
  	"format_decimals" numeric,
  	"format_compact" boolean DEFAULT false,
  	"format_prefix" varchar,
  	"format_suffix" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_visualizations_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_kind" "enum__visualizations_v_version_kind" DEFAULT 'chart',
  	"version_dataset_id" integer,
  	"version_data_mode" "enum__visualizations_v_version_data_mode" DEFAULT 'latest',
  	"version_pinned_version_id" integer,
  	"version_chart_type" "enum__visualizations_v_version_chart_type" DEFAULT 'line',
  	"version_chart_x" varchar,
  	"version_chart_series" varchar,
  	"version_chart_x_label" varchar,
  	"version_chart_y_label" varchar,
  	"version_chart_y_format_style" "enum__visualizations_v_version_chart_y_format_style" DEFAULT 'number',
  	"version_chart_y_format_decimals" numeric,
  	"version_chart_y_format_compact" boolean DEFAULT false,
  	"version_chart_y_format_prefix" varchar,
  	"version_chart_y_format_suffix" varchar,
  	"version_chart_zero_baseline" boolean,
  	"version_chart_sort" "enum__visualizations_v_version_chart_sort" DEFAULT 'data',
  	"version_map_geometry" "enum__visualizations_v_version_map_geometry" DEFAULT 'boundaries',
  	"version_map_boundary_dataset_id" integer,
  	"version_map_boundary_version_id" integer,
  	"version_map_join_column" varchar,
  	"version_map_boundary_key" varchar,
  	"version_map_lat_column" varchar,
  	"version_map_lon_column" varchar,
  	"version_map_value_column" varchar,
  	"version_map_label_column" varchar,
  	"version_map_classes" numeric DEFAULT 5,
  	"version_map_legend_title" varchar,
  	"version_map_value_format_style" "enum__visualizations_v_version_map_value_format_style" DEFAULT 'number',
  	"version_map_value_format_decimals" numeric,
  	"version_map_value_format_compact" boolean DEFAULT false,
  	"version_map_value_format_prefix" varchar,
  	"version_map_value_format_suffix" varchar,
  	"version_map_interactive" boolean DEFAULT false,
  	"version_table_sort_column" varchar,
  	"version_table_sort_direction" "enum__visualizations_v_version_table_sort_direction" DEFAULT 'asc',
  	"version_table_searchable" boolean DEFAULT false,
  	"version_table_page_size" numeric DEFAULT 25,
  	"version_embed_url" varchar,
  	"version_embed_width" numeric,
  	"version_embed_height" numeric,
  	"version_caption" varchar,
  	"version_alt_text" varchar,
  	"version_source_name" varchar,
  	"version_source_url" varchar,
  	"version_notes" varchar,
  	"version_show_download" boolean DEFAULT true,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__visualizations_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_visualizations_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "datasets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"source_name" varchar,
  	"source_url" varchar,
  	"methodology" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "dataset_versions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"dataset_id" integer NOT NULL,
  	"version" numeric,
  	"label" varchar,
  	"published" boolean DEFAULT false,
  	"published_at" timestamp(3) with time zone,
  	"format" "enum_dataset_versions_format",
  	"row_count" numeric,
  	"columns" jsonb,
  	"data" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "visualizations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "datasets_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "dataset_versions_id" integer;
  ALTER TABLE "visualizations_table_columns" ADD CONSTRAINT "visualizations_table_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."visualizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "visualizations" ADD CONSTRAINT "visualizations_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "visualizations" ADD CONSTRAINT "visualizations_pinned_version_id_dataset_versions_id_fk" FOREIGN KEY ("pinned_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "visualizations" ADD CONSTRAINT "visualizations_map_boundary_dataset_id_datasets_id_fk" FOREIGN KEY ("map_boundary_dataset_id") REFERENCES "public"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "visualizations" ADD CONSTRAINT "visualizations_map_boundary_version_id_dataset_versions_id_fk" FOREIGN KEY ("map_boundary_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "visualizations_texts" ADD CONSTRAINT "visualizations_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."visualizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_visualizations_v_version_table_columns" ADD CONSTRAINT "_visualizations_v_version_table_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_visualizations_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_visualizations_v" ADD CONSTRAINT "_visualizations_v_parent_id_visualizations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."visualizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_visualizations_v" ADD CONSTRAINT "_visualizations_v_version_dataset_id_datasets_id_fk" FOREIGN KEY ("version_dataset_id") REFERENCES "public"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_visualizations_v" ADD CONSTRAINT "_visualizations_v_version_pinned_version_id_dataset_versions_id_fk" FOREIGN KEY ("version_pinned_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_visualizations_v" ADD CONSTRAINT "_visualizations_v_version_map_boundary_dataset_id_datasets_id_fk" FOREIGN KEY ("version_map_boundary_dataset_id") REFERENCES "public"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_visualizations_v" ADD CONSTRAINT "_visualizations_v_version_map_boundary_version_id_dataset_versions_id_fk" FOREIGN KEY ("version_map_boundary_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_visualizations_v_texts" ADD CONSTRAINT "_visualizations_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_visualizations_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "visualizations_table_columns_order_idx" ON "visualizations_table_columns" USING btree ("_order");
  CREATE INDEX "visualizations_table_columns_parent_id_idx" ON "visualizations_table_columns" USING btree ("_parent_id");
  CREATE INDEX "visualizations_title_idx" ON "visualizations" USING btree ("title");
  CREATE INDEX "visualizations_dataset_idx" ON "visualizations" USING btree ("dataset_id");
  CREATE INDEX "visualizations_pinned_version_idx" ON "visualizations" USING btree ("pinned_version_id");
  CREATE INDEX "visualizations_map_map_boundary_dataset_idx" ON "visualizations" USING btree ("map_boundary_dataset_id");
  CREATE INDEX "visualizations_map_map_boundary_version_idx" ON "visualizations" USING btree ("map_boundary_version_id");
  CREATE INDEX "visualizations_updated_at_idx" ON "visualizations" USING btree ("updated_at");
  CREATE INDEX "visualizations_created_at_idx" ON "visualizations" USING btree ("created_at");
  CREATE INDEX "visualizations__status_idx" ON "visualizations" USING btree ("_status");
  CREATE INDEX "visualizations_texts_order_parent" ON "visualizations_texts" USING btree ("order","parent_id");
  CREATE INDEX "_visualizations_v_version_table_columns_order_idx" ON "_visualizations_v_version_table_columns" USING btree ("_order");
  CREATE INDEX "_visualizations_v_version_table_columns_parent_id_idx" ON "_visualizations_v_version_table_columns" USING btree ("_parent_id");
  CREATE INDEX "_visualizations_v_parent_idx" ON "_visualizations_v" USING btree ("parent_id");
  CREATE INDEX "_visualizations_v_version_version_title_idx" ON "_visualizations_v" USING btree ("version_title");
  CREATE INDEX "_visualizations_v_version_version_dataset_idx" ON "_visualizations_v" USING btree ("version_dataset_id");
  CREATE INDEX "_visualizations_v_version_version_pinned_version_idx" ON "_visualizations_v" USING btree ("version_pinned_version_id");
  CREATE INDEX "_visualizations_v_version_map_version_map_boundary_datas_idx" ON "_visualizations_v" USING btree ("version_map_boundary_dataset_id");
  CREATE INDEX "_visualizations_v_version_map_version_map_boundary_versi_idx" ON "_visualizations_v" USING btree ("version_map_boundary_version_id");
  CREATE INDEX "_visualizations_v_version_version_updated_at_idx" ON "_visualizations_v" USING btree ("version_updated_at");
  CREATE INDEX "_visualizations_v_version_version_created_at_idx" ON "_visualizations_v" USING btree ("version_created_at");
  CREATE INDEX "_visualizations_v_version_version__status_idx" ON "_visualizations_v" USING btree ("version__status");
  CREATE INDEX "_visualizations_v_created_at_idx" ON "_visualizations_v" USING btree ("created_at");
  CREATE INDEX "_visualizations_v_updated_at_idx" ON "_visualizations_v" USING btree ("updated_at");
  CREATE INDEX "_visualizations_v_latest_idx" ON "_visualizations_v" USING btree ("latest");
  CREATE INDEX "_visualizations_v_autosave_idx" ON "_visualizations_v" USING btree ("autosave");
  CREATE INDEX "_visualizations_v_texts_order_parent" ON "_visualizations_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "datasets_title_idx" ON "datasets" USING btree ("title");
  CREATE INDEX "datasets_updated_at_idx" ON "datasets" USING btree ("updated_at");
  CREATE INDEX "datasets_created_at_idx" ON "datasets" USING btree ("created_at");
  CREATE INDEX "dataset_versions_dataset_idx" ON "dataset_versions" USING btree ("dataset_id");
  CREATE INDEX "dataset_versions_updated_at_idx" ON "dataset_versions" USING btree ("updated_at");
  CREATE INDEX "dataset_versions_created_at_idx" ON "dataset_versions" USING btree ("created_at");
  CREATE UNIQUE INDEX "dataset_versions_filename_idx" ON "dataset_versions" USING btree ("filename");
  CREATE UNIQUE INDEX "dataset_version_idx" ON "dataset_versions" USING btree ("dataset_id","version");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_visualizations_fk" FOREIGN KEY ("visualizations_id") REFERENCES "public"."visualizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_datasets_fk" FOREIGN KEY ("datasets_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_dataset_versions_fk" FOREIGN KEY ("dataset_versions_id") REFERENCES "public"."dataset_versions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_visualizations_id_idx" ON "payload_locked_documents_rels" USING btree ("visualizations_id");
  CREATE INDEX "payload_locked_documents_rels_datasets_id_idx" ON "payload_locked_documents_rels" USING btree ("datasets_id");
  CREATE INDEX "payload_locked_documents_rels_dataset_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("dataset_versions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "visualizations_table_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "visualizations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "visualizations_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_visualizations_v_version_table_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_visualizations_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_visualizations_v_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "datasets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "dataset_versions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "visualizations_table_columns" CASCADE;
  DROP TABLE "visualizations" CASCADE;
  DROP TABLE "visualizations_texts" CASCADE;
  DROP TABLE "_visualizations_v_version_table_columns" CASCADE;
  DROP TABLE "_visualizations_v" CASCADE;
  DROP TABLE "_visualizations_v_texts" CASCADE;
  DROP TABLE "datasets" CASCADE;
  DROP TABLE "dataset_versions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_visualizations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_datasets_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_dataset_versions_fk";
  
  DROP INDEX "payload_locked_documents_rels_visualizations_id_idx";
  DROP INDEX "payload_locked_documents_rels_datasets_id_idx";
  DROP INDEX "payload_locked_documents_rels_dataset_versions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "visualizations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "datasets_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "dataset_versions_id";
  DROP TYPE "public"."enum_visualizations_table_columns_format_style";
  DROP TYPE "public"."enum_visualizations_kind";
  DROP TYPE "public"."enum_visualizations_data_mode";
  DROP TYPE "public"."enum_visualizations_chart_type";
  DROP TYPE "public"."enum_visualizations_chart_y_format_style";
  DROP TYPE "public"."enum_visualizations_chart_sort";
  DROP TYPE "public"."enum_visualizations_map_geometry";
  DROP TYPE "public"."enum_visualizations_map_value_format_style";
  DROP TYPE "public"."enum_visualizations_table_sort_direction";
  DROP TYPE "public"."enum_visualizations_status";
  DROP TYPE "public"."enum__visualizations_v_version_table_columns_format_style";
  DROP TYPE "public"."enum__visualizations_v_version_kind";
  DROP TYPE "public"."enum__visualizations_v_version_data_mode";
  DROP TYPE "public"."enum__visualizations_v_version_chart_type";
  DROP TYPE "public"."enum__visualizations_v_version_chart_y_format_style";
  DROP TYPE "public"."enum__visualizations_v_version_chart_sort";
  DROP TYPE "public"."enum__visualizations_v_version_map_geometry";
  DROP TYPE "public"."enum__visualizations_v_version_map_value_format_style";
  DROP TYPE "public"."enum__visualizations_v_version_table_sort_direction";
  DROP TYPE "public"."enum__visualizations_v_version_status";
  DROP TYPE "public"."enum_dataset_versions_format";`)
}
