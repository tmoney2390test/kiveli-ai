-- Replace stock public place descriptions without touching custom places.
with edits(id, old_copy, new_copy) as (
  values
  ('29628d1c-5f41-52d4-bd76-4bb8a82c7a68'::uuid, 'A boardinghouse offering solid meals, modest rooms, and a household rhythm that gives working residents somewhere to return to.', 'Boatmen rent small rooms here, eat together downstairs, and come home at whatever hour the river lets them.'),
  ('9fcae9c7-e773-534c-9ac7-7df82b66ae17'::uuid, 'A warm bakery serving ordinary bread, occasional elaborate pastries, and a few tables whose regulars know the rhythms of the oven.', 'Hearthstone bakes bread every morning and saves the fancy pastries for good days. Regulars take the tables closest to the oven.'),
  ('96ed8d24-eb88-5fa9-ae9c-45257c6c6221'::uuid, 'An old relay station that gives independent carriers a place to change animals, leave agreed consignments, and weigh how much they need to know.', 'Independent riders change horses and leave packages at this old relay stop. The less anyone asks about a delivery, the smoother it goes.'),
  ('65aa25c9-b4db-5710-8594-91642bddc294'::uuid, 'A small schoolhouse whose adult evening classes and community meetings provide a place to ask a question without performing confidence.', 'The schoolhouse hosts children by day, then adult classes and town meetings after dark. No one minds if you need something explained twice.'),
  ('2a000000-0000-4000-8000-000000000107'::uuid, 'A major urban hospital and outpatient complex serving Juniper City, with emergency care, clinics, staff shifts, visitors, and the constant rhythm of a real working hospital.', 'Juniper''s busy hospital handles emergencies, routine appointments, and everything in between. The waiting room is rarely empty.')
)
update public.together_locations as l
set description = edits.new_copy,
    canonical_lore = jsonb_set(l.canonical_lore, '{summary}', to_jsonb(edits.new_copy), true),
    updated_at = now()
from edits
where l.id = edits.id
  and l.owner_user_id is null
  and l.description = edits.old_copy
  and l.canonical_lore->>'summary' = edits.old_copy;
