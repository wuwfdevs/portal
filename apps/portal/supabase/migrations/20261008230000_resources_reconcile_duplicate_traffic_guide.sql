-- Reclassify combined Traffic guide as overview without removing its content.
update public.rc_articles set title='Exceptions through affidavits: overview',summary='How missed credits, makegoods and affidavits fit together; use the dedicated guides for current controls.',screen_keys=array['underwriting.exceptions','underwriting.affidavits'],sort_order=38,
body=jsonb_set(body,'{content}',jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(
jsonb_build_object('type','text','text','For current actions, use '),
jsonb_build_object('type','text','text','Exceptions and makegoods','marks',jsonb_build_array(jsonb_build_object('type','link','attrs',jsonb_build_object('href','/resources/tools/underwriting/underwriting-exceptions-and-makegoods')))),
jsonb_build_object('type','text','text',' and '),
jsonb_build_object('type','text','text','Affidavits','marks',jsonb_build_array(jsonb_build_object('type','link','attrs',jsonb_build_object('href','/resources/tools/underwriting/underwriting-affidavits')))),
jsonb_build_object('type','text','text','. The overview below describes how those workflows connect.')))) || (body->'content')),
version_note='Reclassified combined guide as overview; linked specialized guides and assigned screen contexts'
where slug='underwriting-exceptions-makegoods-affidavits' and coalesce(array_length(screen_keys,1),0)=0 returning slug,screen_keys,version;
