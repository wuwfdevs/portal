import * as migration_20261030_210928_initial_content_model from './20261030_210928_initial_content_model';

export const migrations = [
  {
    up: migration_20261030_210928_initial_content_model.up,
    down: migration_20261030_210928_initial_content_model.down,
    name: '20261030_210928_initial_content_model'
  },
];
