import type { Block } from 'payload'

import { isDataAttribute, isElementId, isEventName, MAX_WIDGET_HEIGHT, MIN_WIDGET_HEIGHT, DEFAULT_WIDGET_HEIGHT, checkScriptUrl, SCRIPT_URL_MESSAGE } from '../../lib/widgets'

/**
 * An interactive tool that works by running a script from another site (an election guide, a chart, a map): a
 * container element, optional `data-*` settings, and one https script. It is structured fields, never free HTML.
 * The script runs in a sandboxed frame with no access to this site. It loads by itself when its host is built in or approved
 * in Site settings (the election-guide service is), and after the reader clicks for any other host.
 * Only a publisher can add or change one (the story save is checked), because it decides which site's code a reader runs.
 */
export const Widget: Block = {
  slug: 'widget',
  interfaceName: 'WidgetBlock',
  labels: { singular: 'Script widget', plural: 'Script widgets' },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: { description: 'What the tool is, e.g. "Election guide". Read by screen readers, and shown on the click-to-load card for a host that has not been approved.' },
    },
    {
      name: 'scriptUrl',
      type: 'text',
      required: true,
      admin: { description: 'The https address of the tool\'s script. It runs in an isolated frame. Hosts that are not built in or approved in Site settings load only after the reader clicks.' },
      validate: (value: string | null | undefined) => {
        const r = checkScriptUrl(value)
        return r.ok ? true : SCRIPT_URL_MESSAGE[r.reason]
      },
    },
    { name: 'module', type: 'checkbox', defaultValue: false, admin: { description: 'Load the script as a module. Only if the tool\'s instructions say type="module".' } },
    {
      name: 'elementId',
      type: 'text',
      admin: { description: 'The id of the container the script fills, if its instructions give one.' },
      validate: (v: string | null | undefined) => (!v || isElementId(v) ? true : 'Use letters, digits, - _ : and . and start with a letter.'),
    },
    {
      name: 'attributes',
      type: 'array',
      labels: { singular: 'Setting', plural: 'Settings' },
      admin: { description: 'The data- settings from the tool\'s instructions (e.g. data-election-id).' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              admin: { width: '40%', description: 'Must start with data-' },
              validate: (v: string | null | undefined) => (v && isDataAttribute(v) ? true : 'The name must start with data- and use lower-case letters, digits, - _ or .'),
            },
            { name: 'value', type: 'text', admin: { width: '60%' } },
          ],
        },
      ],
    },
    {
      name: 'initEvent',
      type: 'text',
      admin: { description: 'An event the tool expects before it loads, if its instructions say to dispatch one.' },
      validate: (v: string | null | undefined) => (!v || isEventName(v) ? true : 'Use letters, digits, - _ : and . and start with a letter.'),
    },
    {
      name: 'height',
      type: 'number',
      defaultValue: DEFAULT_WIDGET_HEIGHT,
      min: MIN_WIDGET_HEIGHT,
      max: MAX_WIDGET_HEIGHT,
      admin: { description: 'Starting height in pixels, used until the tool reports its own.' },
    },
    { name: 'caption', type: 'text', admin: { description: 'Shown under the tool.' } },
  ],
}
