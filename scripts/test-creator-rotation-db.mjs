import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const source = readFileSync(
  "supabase/migrations/202608160019_kivelle_creator_studio.sql",
  "utf8",
);
const validation = source.slice(
  source.indexOf("  block_count:=jsonb_array_length"),
  source.indexOf("  template_id:=draft.legacy_template_id"),
);
const insertion = source.slice(
  source.indexOf("  insert into public.together_schedule_templates("),
  source.indexOf(
    "  update public.together_creator_drafts set status='finalized'",
  ),
);
const owner = "00000000-0000-4000-8000-000000000001",
  world = "00000000-0000-4000-8000-000000000002",
  place = "00000000-0000-4000-8000-000000000003";
try {
  await db.exec(`
create table together_profiles(user_id uuid,experience_timezone text);
create table together_locations(id uuid,world_id uuid);
create table together_schedule_templates(character_version_id uuid,day_of_week smallint,start_minute smallint,end_minute smallint,location_id uuid,activity text,availability text,energy_delta smallint,mood_influence text,metadata jsonb not null default '{}',unique(character_version_id,day_of_week,start_minute));
create table rotation_input(routine jsonb);
create function kivelle_finalize_creator_draft(p_user_id uuid,p_draft_id uuid,p_request_id uuid) returns jsonb language plpgsql as $$
declare draft record;routine jsonb;block_count int;inserted_count int;version_id uuid:=p_draft_id;now_value timestamptz:=now();
begin
 select p_draft_id id,'${world}'::uuid world_id into draft;
 select input.routine into routine from rotation_input input;
 ${validation}
 ${insertion}
 return '{}'::jsonb;
end;$$;
insert into together_profiles values('${owner}','America/New_York');
insert into together_locations values('${place}','${world}');
`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20260915175825_creator_rotating_weeks.sql",
      "utf8",
    ),
  );
  const block = {
    dayOfWeek: 1,
    startMinute: 540,
    endMinute: 1020,
    locationId: place,
    activity: "Working",
    availability: "busy",
  };
  const run = async (blocks) => {
    await db.exec(
      "delete from rotation_input;delete from together_schedule_templates;",
    );
    await db.query("insert into rotation_input values($1)", [
      JSON.stringify({ blocks }),
    ]);
    return db.query("select kivelle_finalize_creator_draft($1,$2,$3)", [
      owner,
      owner,
      owner,
    ]);
  };
  await run([block, { ...block, weekIndex: 1 }, { ...block, weekIndex: 2 }]);
  const rows = (await db.query(
    "select week_index,metadata from together_schedule_templates order by week_index",
  )).rows;
  assert.deepEqual(rows.map((r) => r.week_index), [0, 1, 2]);
  assert.equal(rows[2].metadata.cycleWeeks, 3);
  assert.match(rows[0].metadata.cycleAnchorDate, /^\d{4}-\d{2}-\d{2}$/);
  await assert.rejects(
    () => run([block, { ...block, weekIndex: 2 }]),
    /Each rotating week/,
  );
  await assert.rejects(
    () => run([block, { ...block, weekIndex: 3 }]),
    /Invalid rotation week/,
  );
  await assert.rejects(
    () => run([block, { ...block, startMinute: 550 }]),
    /cannot overlap/,
  );
  await run([block]);
  assert.equal(
    (await db.query("select metadata from together_schedule_templates")).rows[0]
      .metadata.cycleWeeks,
    1,
  );
  await assert.rejects(
    () =>
      db.exec(
        `insert into together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence,metadata) select character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence,metadata from together_schedule_templates`,
      ),
    /duplicate key/,
  );
  console.log("Creator rotation database checks passed.");
} finally {
  await db.close();
}
