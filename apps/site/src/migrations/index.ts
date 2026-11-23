import * as migration_20261030_210928_initial_content_model from './20261030_210928_initial_content_model';
import * as migration_20261030_213831_portal_sign_in from './20261030_213831_portal_sign_in';
import * as migration_20261031_002113_site_globals_and_legacy_identity from './20261031_002113_site_globals_and_legacy_identity';
import * as migration_20261031_010109_site_settings_embed_hosts from './20261031_010109_site_settings_embed_hosts';
import * as migration_20261031_010737_support_page from './20261031_010737_support_page';
import * as migration_20261102_180610_paths_and_sections from './20261102_180610_paths_and_sections';
import * as migration_20261102_183024_legacy_grove_id_and_modified_at from './20261102_183024_legacy_grove_id_and_modified_at';
import * as migration_20261102_220306_featured_media_and_audio from './20261102_220306_featured_media_and_audio';
import * as migration_20261102_234817_video_library_and_player from './20261102_234817_video_library_and_player';
import * as migration_20261103_004740_storage_prefix_fields from './20261103_004740_storage_prefix_fields';
import * as migration_20261103_023039_fellowship_hub_fields from './20261103_023039_fellowship_hub_fields';
import * as migration_20261103_024053_homepage_global from './20261103_024053_homepage_global';
import * as migration_20261103_025619_live_blogs from './20261103_025619_live_blogs';
import * as migration_20261103_032912_page_templates from './20261103_032912_page_templates';
import * as migration_20261103_033745_show_fields from './20261103_033745_show_fields';
import * as migration_20261103_040200_backfill_page_templates from './20261103_040200_backfill_page_templates';
import * as migration_20261103_042706_community_calendar from './20261103_042706_community_calendar';
import * as migration_20261103_052450_author_profiles from './20261103_052450_author_profiles';
import * as migration_20261103_052904_hubs from './20261103_052904_hubs';
import * as migration_20261103_170456_live_blog_story_fields from './20261103_170456_live_blog_story_fields';
import * as migration_20261103_170521_remove_live_blogs_collection from './20261103_170521_remove_live_blogs_collection';
import * as migration_20261103_172011_event_review_fields from './20261103_172011_event_review_fields';
import * as migration_20261103_172027_remove_event_submissions from './20261103_172027_remove_event_submissions';
import * as migration_20261104_182013_syndicated_programs from './20261104_182013_syndicated_programs';
import * as migration_20261106_150459_clips from './20261106_150459_clips';
import * as migration_20261106_154058_radiolive from './20261106_154058_radiolive';
import * as migration_20261106_174248_radiolive_virtual_and_hosted_recording from './20261106_174248_radiolive_virtual_and_hosted_recording';
import * as migration_20261106_175346_radiolive_visit_and_membership from './20261106_175346_radiolive_visit_and_membership';
import * as migration_20261106_212555_homepage_slots from './20261106_212555_homepage_slots';
import * as migration_20261106_220832_members_only from './20261106_220832_members_only';
import * as migration_20261106_221525_show_themes_archive from './20261106_221525_show_themes_archive';
import * as migration_20261106_223920_seasons from './20261106_223920_seasons';
import * as migration_20261106_232627_audience_profiles from './20261106_232627_audience_profiles';
import * as migration_20261106_234035_remove_show_level_perks from './20261106_234035_remove_show_level_perks';
import * as migration_20261106_234554_memberships from './20261106_234554_memberships';
import * as migration_20261107_002936_member_feeds from './20261107_002936_member_feeds';
import * as migration_20261107_043501_board27_header_search_public_file from './20261107_043501_board27_header_search_public_file';
import * as migration_20261107_055404_listen_live from './20261107_055404_listen_live';
import * as migration_20261107_070000_header_starting_menus from './20261107_070000_header_starting_menus';
import * as migration_20261107_080000_unearthing_hub_start from './20261107_080000_unearthing_hub_start';
import * as migration_20261110_171043_topic_listening_question from './20261110_171043_topic_listening_question';
import * as migration_20261110_172000_header_listens_link from './20261110_172000_header_listens_link';
import * as migration_20261113_220000_header_schedule_link from './20261113_220000_header_schedule_link';
import * as migration_20261113_222100_story_embeddings from './20261113_222100_story_embeddings';
import * as migration_20261113_225238_site_settings_semantic_search from './20261113_225238_site_settings_semantic_search';
import * as migration_20261114_023103_site_settings_portal_origin from './20261114_023103_site_settings_portal_origin';
import * as migration_20261114_040000_voyager_hub_start from './20261114_040000_voyager_hub_start';
import * as migration_20261117_181047_sponsorship_pages from './20261117_181047_sponsorship_pages';
import * as migration_20261117_194934_sponsorship_copy from './20261117_194934_sponsorship_copy';
import * as migration_20261117_224728_giving_pages from './20261117_224728_giving_pages';
import * as migration_20261118_034853_giving_form_addresses from './20261118_034853_giving_form_addresses';
import * as migration_20261118_154406_site_settings_embedding_tuning from './20261118_154406_site_settings_embedding_tuning';
import * as migration_20261118_161412_news_sections_and_placements from './20261118_161412_news_sections_and_placements';
import * as migration_20261118_191825_placement_items from './20261118_191825_placement_items';
import * as migration_20261118_221136_network_content from './20261118_221136_network_content';
import * as migration_20261119_031411_dataviz_tables from './20261119_031411_dataviz_tables';
import * as migration_20261119_031412_sections_pages from './20261119_031412_sections_pages';
import * as migration_20261119_031420_home_page_flag_columns from './20261119_031420_home_page_flag_columns';
import * as migration_20261119_031423_show_home_page_columns from './20261119_031423_show_home_page_columns';
import * as migration_20261119_031424_unearthing_explore_columns from './20261119_031424_unearthing_explore_columns';
import * as migration_20261119_031427_blocks_to_json from './20261119_031427_blocks_to_json';
import * as migration_20261119_050302_sponsorship_settings from './20261119_050302_sponsorship_settings';
import * as migration_20261119_050400_sponsor_pages from './20261119_050400_sponsor_pages';
import * as migration_20261119_150000_sponsor_pages_polish from './20261119_150000_sponsor_pages_polish';
import * as migration_20261119_160000_sponsor_pages_polish2 from './20261119_160000_sponsor_pages_polish2';
import * as migration_20261119_190000_sponsor_pages_clean from './20261119_190000_sponsor_pages_clean';
import * as migration_20261119_200000_sponsor_pages_clean2 from './20261119_200000_sponsor_pages_clean2';
import * as migration_20261119_222418_giving_settings from './20261119_222418_giving_settings';
import * as migration_20261119_223000_giving_pages_as_sections from './20261119_223000_giving_pages_as_sections';
import * as migration_20261119_233120_shared_text from './20261119_233120_shared_text';
import * as migration_20261119_235000_station_pages_as_sections from './20261119_235000_station_pages_as_sections';
import * as migration_20261119_235500_listens_pages_as_sections from './20261119_235500_listens_pages_as_sections';
import * as migration_20261120_162233_placement_fills_gaps from './20261120_162233_placement_fills_gaps';
import * as migration_20261120_173640_site_banner from './20261120_173640_site_banner';
import * as migration_20261120_202320_placement_top_zones from './20261120_202320_placement_top_zones';
import * as migration_20261120_202458_story_no_placements from './20261120_202458_story_no_placements';
import * as migration_20261120_203039_placement_story_zones from './20261120_203039_placement_story_zones';
import * as migration_20261120_204634_page_set_home from './20261120_204634_page_set_home';
import * as migration_20261120_221651_story_rail_retired from './20261120_221651_story_rail_retired';
import * as migration_20261121_010545_sections_swatch from './20261121_010545_sections_swatch';
import * as migration_20261121_055549_home_page_record_site_banner from './20261121_055549_home_page_record_site_banner';
import * as migration_20261121_163355_home_page_seo from './20261121_163355_home_page_seo';
import * as migration_20261121_164549_home_page_flag from './20261121_164549_home_page_flag';
import * as migration_20261123_010555_show_home_page from './20261123_010555_show_home_page';
import * as migration_20261123_013206_unearthing_explore from './20261123_013206_unearthing_explore';
import * as migration_20261123_013300_unearthing_home_page from './20261123_013300_unearthing_home_page';

export const migrations = [
  {
    up: migration_20261030_210928_initial_content_model.up,
    down: migration_20261030_210928_initial_content_model.down,
    name: '20261030_210928_initial_content_model',
  },
  {
    up: migration_20261030_213831_portal_sign_in.up,
    down: migration_20261030_213831_portal_sign_in.down,
    name: '20261030_213831_portal_sign_in',
  },
  {
    up: migration_20261031_002113_site_globals_and_legacy_identity.up,
    down: migration_20261031_002113_site_globals_and_legacy_identity.down,
    name: '20261031_002113_site_globals_and_legacy_identity',
  },
  {
    up: migration_20261031_010109_site_settings_embed_hosts.up,
    down: migration_20261031_010109_site_settings_embed_hosts.down,
    name: '20261031_010109_site_settings_embed_hosts',
  },
  {
    up: migration_20261031_010737_support_page.up,
    down: migration_20261031_010737_support_page.down,
    name: '20261031_010737_support_page',
  },
  {
    up: migration_20261102_180610_paths_and_sections.up,
    down: migration_20261102_180610_paths_and_sections.down,
    name: '20261102_180610_paths_and_sections',
  },
  {
    up: migration_20261102_183024_legacy_grove_id_and_modified_at.up,
    down: migration_20261102_183024_legacy_grove_id_and_modified_at.down,
    name: '20261102_183024_legacy_grove_id_and_modified_at',
  },
  {
    up: migration_20261102_220306_featured_media_and_audio.up,
    down: migration_20261102_220306_featured_media_and_audio.down,
    name: '20261102_220306_featured_media_and_audio',
  },
  {
    up: migration_20261102_234817_video_library_and_player.up,
    down: migration_20261102_234817_video_library_and_player.down,
    name: '20261102_234817_video_library_and_player',
  },
  {
    up: migration_20261103_004740_storage_prefix_fields.up,
    down: migration_20261103_004740_storage_prefix_fields.down,
    name: '20261103_004740_storage_prefix_fields',
  },
  {
    up: migration_20261103_023039_fellowship_hub_fields.up,
    down: migration_20261103_023039_fellowship_hub_fields.down,
    name: '20261103_023039_fellowship_hub_fields',
  },
  {
    up: migration_20261103_024053_homepage_global.up,
    down: migration_20261103_024053_homepage_global.down,
    name: '20261103_024053_homepage_global',
  },
  {
    up: migration_20261103_025619_live_blogs.up,
    down: migration_20261103_025619_live_blogs.down,
    name: '20261103_025619_live_blogs',
  },
  {
    up: migration_20261103_032912_page_templates.up,
    down: migration_20261103_032912_page_templates.down,
    name: '20261103_032912_page_templates',
  },
  {
    up: migration_20261103_033745_show_fields.up,
    down: migration_20261103_033745_show_fields.down,
    name: '20261103_033745_show_fields',
  },
  {
    up: migration_20261103_040200_backfill_page_templates.up,
    down: migration_20261103_040200_backfill_page_templates.down,
    name: '20261103_040200_backfill_page_templates',
  },
  {
    up: migration_20261103_042706_community_calendar.up,
    down: migration_20261103_042706_community_calendar.down,
    name: '20261103_042706_community_calendar',
  },
  {
    up: migration_20261103_052450_author_profiles.up,
    down: migration_20261103_052450_author_profiles.down,
    name: '20261103_052450_author_profiles',
  },
  {
    up: migration_20261103_052904_hubs.up,
    down: migration_20261103_052904_hubs.down,
    name: '20261103_052904_hubs',
  },
  {
    up: migration_20261103_170456_live_blog_story_fields.up,
    down: migration_20261103_170456_live_blog_story_fields.down,
    name: '20261103_170456_live_blog_story_fields',
  },
  {
    up: migration_20261103_170521_remove_live_blogs_collection.up,
    down: migration_20261103_170521_remove_live_blogs_collection.down,
    name: '20261103_170521_remove_live_blogs_collection',
  },
  {
    up: migration_20261103_172011_event_review_fields.up,
    down: migration_20261103_172011_event_review_fields.down,
    name: '20261103_172011_event_review_fields',
  },
  {
    up: migration_20261103_172027_remove_event_submissions.up,
    down: migration_20261103_172027_remove_event_submissions.down,
    name: '20261103_172027_remove_event_submissions',
  },
  {
    up: migration_20261104_182013_syndicated_programs.up,
    down: migration_20261104_182013_syndicated_programs.down,
    name: '20261104_182013_syndicated_programs',
  },
  {
    up: migration_20261106_150459_clips.up,
    down: migration_20261106_150459_clips.down,
    name: '20261106_150459_clips',
  },
  {
    up: migration_20261106_154058_radiolive.up,
    down: migration_20261106_154058_radiolive.down,
    name: '20261106_154058_radiolive',
  },
  {
    up: migration_20261106_174248_radiolive_virtual_and_hosted_recording.up,
    down: migration_20261106_174248_radiolive_virtual_and_hosted_recording.down,
    name: '20261106_174248_radiolive_virtual_and_hosted_recording',
  },
  {
    up: migration_20261106_175346_radiolive_visit_and_membership.up,
    down: migration_20261106_175346_radiolive_visit_and_membership.down,
    name: '20261106_175346_radiolive_visit_and_membership',
  },
  {
    up: migration_20261106_212555_homepage_slots.up,
    down: migration_20261106_212555_homepage_slots.down,
    name: '20261106_212555_homepage_slots',
  },
  {
    up: migration_20261106_220832_members_only.up,
    down: migration_20261106_220832_members_only.down,
    name: '20261106_220832_members_only',
  },
  {
    up: migration_20261106_221525_show_themes_archive.up,
    down: migration_20261106_221525_show_themes_archive.down,
    name: '20261106_221525_show_themes_archive',
  },
  {
    up: migration_20261106_223920_seasons.up,
    down: migration_20261106_223920_seasons.down,
    name: '20261106_223920_seasons',
  },
  {
    up: migration_20261106_232627_audience_profiles.up,
    down: migration_20261106_232627_audience_profiles.down,
    name: '20261106_232627_audience_profiles',
  },
  {
    up: migration_20261106_234035_remove_show_level_perks.up,
    down: migration_20261106_234035_remove_show_level_perks.down,
    name: '20261106_234035_remove_show_level_perks',
  },
  {
    up: migration_20261106_234554_memberships.up,
    down: migration_20261106_234554_memberships.down,
    name: '20261106_234554_memberships',
  },
  {
    up: migration_20261107_002936_member_feeds.up,
    down: migration_20261107_002936_member_feeds.down,
    name: '20261107_002936_member_feeds',
  },
  {
    up: migration_20261107_043501_board27_header_search_public_file.up,
    down: migration_20261107_043501_board27_header_search_public_file.down,
    name: '20261107_043501_board27_header_search_public_file',
  },
  {
    up: migration_20261107_055404_listen_live.up,
    down: migration_20261107_055404_listen_live.down,
    name: '20261107_055404_listen_live',
  },
  {
    up: migration_20261107_070000_header_starting_menus.up,
    down: migration_20261107_070000_header_starting_menus.down,
    name: '20261107_070000_header_starting_menus',
  },
  {
    up: migration_20261107_080000_unearthing_hub_start.up,
    down: migration_20261107_080000_unearthing_hub_start.down,
    name: '20261107_080000_unearthing_hub_start',
  },
  {
    up: migration_20261110_171043_topic_listening_question.up,
    down: migration_20261110_171043_topic_listening_question.down,
    name: '20261110_171043_topic_listening_question',
  },
  {
    up: migration_20261110_172000_header_listens_link.up,
    down: migration_20261110_172000_header_listens_link.down,
    name: '20261110_172000_header_listens_link',
  },
  {
    up: migration_20261113_220000_header_schedule_link.up,
    down: migration_20261113_220000_header_schedule_link.down,
    name: '20261113_220000_header_schedule_link',
  },
  {
    up: migration_20261113_222100_story_embeddings.up,
    down: migration_20261113_222100_story_embeddings.down,
    name: '20261113_222100_story_embeddings',
  },
  {
    up: migration_20261113_225238_site_settings_semantic_search.up,
    down: migration_20261113_225238_site_settings_semantic_search.down,
    name: '20261113_225238_site_settings_semantic_search',
  },
  {
    up: migration_20261114_023103_site_settings_portal_origin.up,
    down: migration_20261114_023103_site_settings_portal_origin.down,
    name: '20261114_023103_site_settings_portal_origin',
  },
  {
    up: migration_20261114_040000_voyager_hub_start.up,
    down: migration_20261114_040000_voyager_hub_start.down,
    name: '20261114_040000_voyager_hub_start',
  },
  {
    up: migration_20261117_181047_sponsorship_pages.up,
    down: migration_20261117_181047_sponsorship_pages.down,
    name: '20261117_181047_sponsorship_pages',
  },
  {
    up: migration_20261117_194934_sponsorship_copy.up,
    down: migration_20261117_194934_sponsorship_copy.down,
    name: '20261117_194934_sponsorship_copy',
  },
  {
    up: migration_20261117_224728_giving_pages.up,
    down: migration_20261117_224728_giving_pages.down,
    name: '20261117_224728_giving_pages',
  },
  {
    up: migration_20261118_034853_giving_form_addresses.up,
    down: migration_20261118_034853_giving_form_addresses.down,
    name: '20261118_034853_giving_form_addresses',
  },
  {
    up: migration_20261118_154406_site_settings_embedding_tuning.up,
    down: migration_20261118_154406_site_settings_embedding_tuning.down,
    name: '20261118_154406_site_settings_embedding_tuning',
  },
  {
    up: migration_20261118_161412_news_sections_and_placements.up,
    down: migration_20261118_161412_news_sections_and_placements.down,
    name: '20261118_161412_news_sections_and_placements',
  },
  {
    up: migration_20261118_191825_placement_items.up,
    down: migration_20261118_191825_placement_items.down,
    name: '20261118_191825_placement_items',
  },
  {
    up: migration_20261118_221136_network_content.up,
    down: migration_20261118_221136_network_content.down,
    name: '20261118_221136_network_content',
  },
  {
    // The data visualization tables. Written late but named early, so it runs before the migrations that read documents through the config
    // (CLAUDE.md, "Database": a table or column the config has must exist before any Local-API migration).
    up: migration_20261119_031411_dataviz_tables.up,
    down: migration_20261119_031411_dataviz_tables.down,
    name: '20261119_031411_dataviz_tables',
  },
  {
    up: migration_20261119_031412_sections_pages.up,
    down: migration_20261119_031412_sections_pages.down,
    name: '20261119_031412_sections_pages',
  },
  {
    up: migration_20261119_031420_home_page_flag_columns.up,
    down: migration_20261119_031420_home_page_flag_columns.down,
    name: '20261119_031420_home_page_flag_columns',
  },
  {
    up: migration_20261119_031423_show_home_page_columns.up,
    down: migration_20261119_031423_show_home_page_columns.down,
    name: '20261119_031423_show_home_page_columns',
  },
  {
    up: migration_20261119_031424_unearthing_explore_columns.up,
    down: migration_20261119_031424_unearthing_explore_columns.down,
    name: '20261119_031424_unearthing_explore_columns',
  },
  {
    up: migration_20261119_031427_blocks_to_json.up,
    down: migration_20261119_031427_blocks_to_json.down,
    name: '20261119_031427_blocks_to_json',
  },
  {
    up: migration_20261119_050302_sponsorship_settings.up,
    down: migration_20261119_050302_sponsorship_settings.down,
    name: '20261119_050302_sponsorship_settings',
  },
  {
    up: migration_20261119_050400_sponsor_pages.up,
    down: migration_20261119_050400_sponsor_pages.down,
    name: '20261119_050400_sponsor_pages',
  },
  {
    up: migration_20261119_150000_sponsor_pages_polish.up,
    down: migration_20261119_150000_sponsor_pages_polish.down,
    name: '20261119_150000_sponsor_pages_polish',
  },
  {
    up: migration_20261119_160000_sponsor_pages_polish2.up,
    down: migration_20261119_160000_sponsor_pages_polish2.down,
    name: '20261119_160000_sponsor_pages_polish2',
  },
  {
    up: migration_20261119_190000_sponsor_pages_clean.up,
    down: migration_20261119_190000_sponsor_pages_clean.down,
    name: '20261119_190000_sponsor_pages_clean',
  },
  {
    up: migration_20261119_200000_sponsor_pages_clean2.up,
    down: migration_20261119_200000_sponsor_pages_clean2.down,
    name: '20261119_200000_sponsor_pages_clean2',
  },
  {
    up: migration_20261119_222418_giving_settings.up,
    down: migration_20261119_222418_giving_settings.down,
    name: '20261119_222418_giving_settings',
  },
  {
    up: migration_20261119_223000_giving_pages_as_sections.up,
    down: migration_20261119_223000_giving_pages_as_sections.down,
    name: '20261119_223000_giving_pages_as_sections',
  },
  {
    up: migration_20261119_233120_shared_text.up,
    down: migration_20261119_233120_shared_text.down,
    name: '20261119_233120_shared_text',
  },
  {
    up: migration_20261119_235000_station_pages_as_sections.up,
    down: migration_20261119_235000_station_pages_as_sections.down,
    name: '20261119_235000_station_pages_as_sections',
  },
  {
    up: migration_20261119_235500_listens_pages_as_sections.up,
    down: migration_20261119_235500_listens_pages_as_sections.down,
    name: '20261119_235500_listens_pages_as_sections',
  },
  {
    up: migration_20261120_162233_placement_fills_gaps.up,
    down: migration_20261120_162233_placement_fills_gaps.down,
    name: '20261120_162233_placement_fills_gaps',
  },
  {
    up: migration_20261120_173640_site_banner.up,
    down: migration_20261120_173640_site_banner.down,
    name: '20261120_173640_site_banner',
  },
  {
    up: migration_20261120_202320_placement_top_zones.up,
    down: migration_20261120_202320_placement_top_zones.down,
    name: '20261120_202320_placement_top_zones',
  },
  {
    up: migration_20261120_202458_story_no_placements.up,
    down: migration_20261120_202458_story_no_placements.down,
    name: '20261120_202458_story_no_placements',
  },
  {
    up: migration_20261120_203039_placement_story_zones.up,
    down: migration_20261120_203039_placement_story_zones.down,
    name: '20261120_203039_placement_story_zones',
  },
  {
    up: migration_20261120_204634_page_set_home.up,
    down: migration_20261120_204634_page_set_home.down,
    name: '20261120_204634_page_set_home',
  },
  {
    up: migration_20261120_221651_story_rail_retired.up,
    down: migration_20261120_221651_story_rail_retired.down,
    name: '20261120_221651_story_rail_retired',
  },
  {
    up: migration_20261121_010545_sections_swatch.up,
    down: migration_20261121_010545_sections_swatch.down,
    name: '20261121_010545_sections_swatch',
  },
  {
    up: migration_20261121_055549_home_page_record_site_banner.up,
    down: migration_20261121_055549_home_page_record_site_banner.down,
    name: '20261121_055549_home_page_record_site_banner',
  },
  {
    up: migration_20261121_163355_home_page_seo.up,
    down: migration_20261121_163355_home_page_seo.down,
    name: '20261121_163355_home_page_seo',
  },
  {
    up: migration_20261121_164549_home_page_flag.up,
    down: migration_20261121_164549_home_page_flag.down,
    name: '20261121_164549_home_page_flag',
  },
  {
    up: migration_20261123_010555_show_home_page.up,
    down: migration_20261123_010555_show_home_page.down,
    name: '20261123_010555_show_home_page',
  },
  {
    up: migration_20261123_013206_unearthing_explore.up,
    down: migration_20261123_013206_unearthing_explore.down,
    name: '20261123_013206_unearthing_explore',
  },
  {
    up: migration_20261123_013300_unearthing_home_page.up,
    down: migration_20261123_013300_unearthing_home_page.down,
    name: '20261123_013300_unearthing_home_page',
  },
];
