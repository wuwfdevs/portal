import * as migration_20261030_210928_initial_content_model from './20261030_210928_initial_content_model';
import * as migration_20261030_213831_portal_sign_in from './20261030_213831_portal_sign_in';
import * as migration_20261031_002113_site_globals_and_legacy_identity from './20261031_002113_site_globals_and_legacy_identity';
import * as migration_20261031_010109_site_settings_embed_hosts from './20261031_010109_site_settings_embed_hosts';
import * as migration_20261031_010737_support_page from './20261031_010737_support_page';

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
    name: '20261031_010737_support_page'
  },
];
