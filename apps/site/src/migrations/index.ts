import * as migration_20261030_210928_initial_content_model from './20261030_210928_initial_content_model';
import * as migration_20261030_213831_portal_sign_in from './20261030_213831_portal_sign_in';
import * as migration_20261031_002113_site_globals_and_legacy_identity from './20261031_002113_site_globals_and_legacy_identity';
import * as migration_20261031_010109_site_settings_embed_hosts from './20261031_010109_site_settings_embed_hosts';
import * as migration_20261031_010737_support_page from './20261031_010737_support_page';
import * as migration_20261102_180610_paths_and_sections from './20261102_180610_paths_and_sections';
import * as migration_20261102_183024_legacy_grove_id_and_modified_at from './20261102_183024_legacy_grove_id_and_modified_at';
import * as migration_20261102_220306_featured_media_and_audio from './20261102_220306_featured_media_and_audio';
import * as migration_20261102_234817_video_library_and_player from './20261102_234817_video_library_and_player';

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
    name: '20261102_234817_video_library_and_player'
  },
];
