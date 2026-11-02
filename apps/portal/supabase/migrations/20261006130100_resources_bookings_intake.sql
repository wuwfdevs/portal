-- Resources content for Bookings' slice 4, the public intake (CLAUDE.md,
-- "Resources stay in step with the code"). Content only; the schema is
-- 20261006130000_bookings_public_intake.sql. One new guide — the public
-- request form and its settings — and the release note.

select private.rc_release_guide(
  p_slug => 'bookings-intake',
  p_tool_key => 'bookings',
  p_title => 'The public request form',
  p_summary => 'How a unit or an outside organization asks for production work or airtime from outside the portal, where its request lands, and how the form is opened, worded and embedded.',
  p_screen_keys => array['bookings.intake'],
  p_sort_order => 25,
  p_version_note => 'Slice 4: the public intake',
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A university unit or an outside organization asks WUWF for production work or airtime at "},{"type":"text","text":"tools.wuwf.org/book","marks":[{"type":"code"}]},{"type":"text","text":", or through the same form embedded in a Grove page. No sign-in is needed and no rate appears on the form. Each submission lands on the Requests tab at the Request stage, marked as received from the public form, with the submitter's unit named as the partner (an existing partner by the same name is reused) and the submitter as the contact."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"What the form asks"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Who is asking: a name, an email, a phone, the college, department, office or organization, and whether it is part of UWF."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"What is needed: production, airtime or both; a short title; for production, which of the offered services (recorded on the request as "},{"type":"text","text":"Services asked for","marks":[{"type":"bold"}]},{"type":"text","text":" — production staff add the real estimate lines); a description."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"When and where: the event or recording dates, when the finished work is needed, and a location. The form books nothing; dates are checked and held when the estimate is sent."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"For airtime: airings a week, the length of each, and the first and last airing. When all three are given the request carries an airtime commitment, contributed by default, for staff to review against the term's envelope."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Settings"}]},{"type":"paragraph","content":[{"type":"text","text":"From Requests, "},{"type":"text","text":"Public form","marks":[{"type":"bold"}]},{"type":"text","text":" opens the form's settings. The Director of Operations or the Executive Director decides whether the form is taking requests, edits the introduction, the confirmation shown after a request is sent and the copy shown while the form is closed, and lists the services the form offers, one a line. Everyone with access can read the settings and copy the public link or the Grove embed code; the preview beneath them shows the form as it is served."}]},{"type":"paragraph","content":[{"type":"text","text":"A visitor may send at most three requests a day from one email address, and a form that was filled in faster than a person could is refused."}]}]}$body$
);

select private.rc_release_note(
  p_slug => 'release-2026-10-06-bookings-intake',
  p_tool_key => 'bookings',
  p_released_on => '2026-10-06',
  p_title => 'Bookings: requests can arrive from outside the portal',
  p_guide_slugs => array['bookings-intake', 'bookings-requests'],
  p_body => $body${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A university unit or an outside organization can now ask WUWF for production work or airtime from a public form at tools.wuwf.org/book, or from the same form embedded in a Grove page, without signing in. Each request lands on the Requests tab at the Request stage with its partner named and the submitter as the contact, ready for production staff to estimate; the services the submitter chose are listed on the request. A new Public form page under Requests lets the Director of Operations or the Executive Director open or close the form, word it, choose the services it offers, and copy its link or embed code. The form is closed until someone opens it."}]}]}$body$
);
