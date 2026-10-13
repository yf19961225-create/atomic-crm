-- Preview-only ordering support. Existing rows stay untouched and retain
-- their historical id ordering; newly appended rows receive a position.
alter table public.romiku_packing_items
  add column position integer check (position > 0);
