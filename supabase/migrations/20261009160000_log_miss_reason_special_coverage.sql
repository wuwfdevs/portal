-- A credit that does not air because the station ran a special clock
-- (FPREN Phase I storm coverage, say) is a miss with its own reason, so the
-- exception queue can name it and be filtered on it. Kept in its own
-- migration: a newly added enum value cannot be used in the transaction that
-- adds it, and 20261009160100 writes events with it.

alter type public.log_miss_reason add value if not exists 'special_coverage';
