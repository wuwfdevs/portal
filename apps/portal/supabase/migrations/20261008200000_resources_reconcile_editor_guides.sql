-- Reconcile two editor-modified Resources guides; append verified navigation guidance only.
-- This migration is idempotent after production's reviewed versions: checks needs_review.
with fixes(slug,addition) as (values
('log-content-library',jsonb_build_object('type','paragraph','content',jsonb_build_array(
jsonb_build_object('type','text','text','For current navigation, open '),
jsonb_build_object('type','text','text','Content library','marks',jsonb_build_array(jsonb_build_object('type','link','attrs',jsonb_build_object('href','/log/library')))),
jsonb_build_object('type','text','text','. The list provides search, status and type filters, an Import from DAD link and + New content item. See the separate DAD-log guide for automation releases.')))),
('underwriting-set-up-a-contract',jsonb_build_object('type','paragraph','content',jsonb_build_array(
jsonb_build_object('type','text','text','After setup, the '),
jsonb_build_object('type','text','text','contract page','marks',jsonb_build_array(jsonb_build_object('type','link','attrs',jsonb_build_object('href','/resources/tools/underwriting/underwriting-contract-page')))),
jsonb_build_object('type','text','text',' organizes active work under Schedule, Copy and Agreement. Refer to the detailed copy, rotation and placement guide when linking messages or filling credits.'))))
)
update public.rc_articles a set body=jsonb_set(a.body,'{content}',a.body->'content'||jsonb_build_array(f.addition)),
needs_review=false,version_note='Reconciled staff-edited guide with current portal navigation; preserved original text',
source='editor' from fixes f where a.slug=f.slug and a.kind='guide' and a.needs_review=true;
