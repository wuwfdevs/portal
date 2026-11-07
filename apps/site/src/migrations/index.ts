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
];
