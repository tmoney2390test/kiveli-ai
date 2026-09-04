"""Generate hidden sexual overlay + SQL migration for every Kivelle companion."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

CAST = Path(r"C:\Users\Tim19\kiveli-ai\scripts\_cast_extract.json")
SQL = Path(r"C:\Users\Tim19\kiveli-ai\supabase\migrations\202609040001_kivelle_cast_hidden_intimacy.sql")
JSON_OUT = Path(r"C:\Users\Tim19\kiveli-ai\scripts\kivelle_hidden_intimacy.json")

YOUNG = range(18, 21)


def h(slug: str, salt: str = "") -> int:
    return int(hashlib.sha1(f"{slug}|{salt}".encode()).hexdigest(), 16)


def pick(slug: str, options: list[str], salt: str = "") -> str:
    return options[h(slug, salt) % len(options)]


FIRST_GENDER: dict[str, str] = {}

FEMININE = {
    "akari","alessia","amelie","amélie","ana","anika","anya","aria","astrid","ava","aya","bianca","brooke","camille","celeste","chloe","chloé","clara","delphine","elena","elise","elodie","emi","emma","evelyn","freya","fumi","hana","hannah","isabella","isolde","kira","laleh","lena","lexi","lia","lina","livia","lyra","maeve","mara","marina","maya","mei","mia","mirelle","nadine","naomi","natsumi","nessa","nia","nina","orla","petra","piper","priya","rika","rin","rowena","sabine","selene","sera","seraphine","sora","sofia","talia","thalia","vittoria","vivienne","yumi","yuna","yuki","zuri","amara","amaya","adelaide","adriana","aisha","elara","emilia","iori","mina","nami","sol",
}
MASCULINE = {
    "adrian","alessandro","andre","arun","bastian","caleb","cassian","daisuke","daniel","dorian","edric","gabriel","garrick","gideon","haruto","idris","jae-min","joren","julian","jun","kael","kaito","kenji","lucien","malik","malrec","marcus","mateo","min-jun","nico","noah","owen","rafael","rhevan","rorik","rowan","theo","théo","tiago","tomas","tomás","torren","ren",
}


def gender_of(row: dict) -> str:
    g = (row.get("gender") or "").lower()
    p = (row.get("pronouns") or "").lower()
    if g in {"woman", "man"}:
        return g
    if "she/" in p:
        return "woman"
    if "he/" in p:
        return "man"
    if "they/" in p:
        return "they"
    first = (row.get("name") or "").split()[0].lower().strip("“”\"'")
    if first in FIRST_GENDER:
        return FIRST_GENDER[first]
    if first in FEMININE and first not in MASCULINE:
        return "woman"
    if first in MASCULINE and first not in FEMININE:
        return "man"
    return "they"


def spice_of(row: dict) -> int:
    try:
        n = int(row.get("spice") or 2)
    except (TypeError, ValueError):
        n = 2
    return 1 if n < 1 else 3 if n > 3 else n


def trait_blob(row: dict) -> str:
    traits = row.get("traits") or []
    if isinstance(traits, str):
        return traits.lower()
    return " ".join(str(t) for t in traits).lower() + " " + str(row.get("romance") or "").lower() + " " + str(row.get("biography") or "").lower()


def setting(occupation: str, slug: str) -> str:
    occ = (occupation or "work").lower()
    mapping = [
        (("lifeguard", "swim"), "after the pool is closed, still damp, ordinary clothes over wet skin"),
        (("cafe", "coffee", "barista", "baker", "pastry"), "after the last tray is out"),
        (("chef", "kitchen", "cook", "restaurant"), "in the dark kitchen after service"),
        (("bartender", "bar ", "pub", "tavern", "lounge"), "after last call, with the bar lights down"),
        (("nurse", "doctor", "surgeon", "clinic", "physician", "healer", "spa", "massage"), "off-shift, no uniform, still smelling of soap"),
        (("professor", "librarian", "archivist", "bookseller", "books"), "between stacks after close"),
        (("student", "teacher"), "after the last class, when the room is finally empty"),
        (("patrol", "guard", "captain", "soldier", "rescue"), "with the radio off, still buzzing from the shift"),
        (("ski", "lift", "mountain", "guide", "trail", "riding", "horse", "gondola"), "with cold air outside and hot skin inside"),
        (("sailor", "harbor", "pier", "boat", "dive"), "in a locked cabin, salt still on the collarbone"),
        (("engineer", "mechanic", "smith", "foundry"), "after the shop is closed"),
        (("artist", "gallery", "photographer", "musician", "dj", "model", "stylist"), "after the show, makeup half off"),
        (("lawyer", "planner", "manager", "director", "executive"), "in one private room with the public face locked away"),
        (("priest", "chapel", "caretaker"), "with vestments off, in a room that is not the chapel"),
        (("editor", "journalist", "analyst"), "with the screens dark and one lamp left"),
        (("arena", "fighter", "coach", "boxer"), "in the shower-steam after a match"),
    ]
    for keys, line in mapping:
        if any(k in occ for k in keys):
            return line
    return pick(slug, [
        "in the dark after work",
        "on a quiet floor that is not the public one",
        "when the door is locked and the day job is nobody else's business",
    ], "setting")


def woman_anatomy(row: dict, spice: int, young: bool) -> str:
    app = (row.get("appearance") or "").lower()
    hair = "dark hair"
    if "blonde" in app or "blond" in app or "gold" in app:
        hair = "blonde hair"
    elif "red" in app or "auburn" in app or "copper" in app or "ginger" in app:
        hair = "red hair"
    elif "silver" in app or "gray" in app or "grey" in app:
        hair = "silver-touched hair"
    elif "black" in app:
        hair = "black hair"
    build = "a real adult body"
    if "athletic" in app or "muscular" in app:
        build = "an athletic body"
    elif "petite" in app or "slim" in app or "lean" in app:
        build = "a lean body"
    elif "curvy" in app or "full" in app or "hourglass" in app:
        build = "a full, curvy body"
    if young:
        return pick(row["slug"], [
            f"Soft mouth, {hair}, {build}, skin that flushes when she is kissed too long.",
            f"{build.capitalize()} under ordinary clothes; a mouth she bites when she wants more and is not ready to say it.",
            f"Warm skin, {hair}, a body she is still learning to ask for without performing cool.",
        ], "anat")
    if spice >= 3:
        return pick(row["slug"], [
            f"{build.capitalize()}, {hair}, full breasts, tight nipples, a wet cunt she keeps to herself until the door is locked, an ass she likes handled.",
            f"Heavy or high breasts depending on the day, {hair} that gets pulled if she asks, a greedy mouth, a slick cunt, strong thighs.",
            f"{build.capitalize()} with a filthy specific map: nipples, clit, the inside of her thighs, a mouth that stays busy.",
        ], "anat")
    if spice == 2:
        return pick(row["slug"], [
            f"{build.capitalize()}, {hair}, breasts she is shy-or-not depending on trust, a mouth that gets wetter than she admits, hips that give her away.",
            f"Warm skin, {hair}, a body that looks professional until it is undressed: breasts, a soft stomach, a cunt she does not joke about.",
            f"{build.capitalize()} with a particular mouth, a particular smell after work, nipples that show when she is already gone.",
        ], "anat")
    return pick(row["slug"], [
        f"{build.capitalize()}, {hair}, a mouth she thinks about more than she says, skin that wants hands not spectacle.",
        f"Quiet body: {hair}, a throat she likes kissed, breasts she keeps, a slow wetness she would rather show than announce.",
    ], "anat")


def man_anatomy(row: dict, spice: int, young: bool) -> str:
    app = (row.get("appearance") or "").lower()
    build = "a solid adult body"
    if "lean" in app or "slim" in app:
        build = "a lean body"
    elif "broad" in app or "muscular" in app or "powerful" in app:
        build = "a broad, physical body"
    if young:
        return pick(row["slug"], [
            f"{build.capitalize()}, a mouth that kisses like he is still surprised he is allowed, a body that gets hard faster than he wants admitted.",
            f"Warm skin, {build}, hands that hover until he is told they can stay.",
        ], "anat")
    if spice >= 3:
        return pick(row["slug"], [
            f"{build.capitalize()}, a thick or long cock he is privately vain about, a mouth that works, an ass he will offer if asked, a chest that takes a partner's weight.",
            f"A heavy cock, tight focus, {build}, a throat that goes quiet when he is close, hands that know what they are doing.",
            f"{build.capitalize()} that looks composed until he is stripped: cock, mouth, the shake in his thighs.",
        ], "anat")
    if spice == 2:
        return pick(row["slug"], [
            f"{build.capitalize()}, a well-kept cock, a patient mouth, a chest he is shy about being kissed on.",
            f"Warm, specific: {build}, a cock that gives him away, a mouth better at sex than speeches.",
        ], "anat")
    return pick(row["slug"], [
        f"{build.capitalize()}, a careful mouth, a cock he does not joke about, a body that wants to be wanted without being inventoried.",
    ], "anat")


def they_anatomy(row: dict, spice: int, young: bool) -> str:
    if young or spice == 1:
        return "A body they name on their own terms; a mouth, hands, and heat they will specify rather than let someone assume."
    return "A body they will describe when they want it used: mouth, chest, cunt or cock as they choose that night, never guessed for them."


def kink(row: dict, g: str, spice: int, young: bool) -> str:
    blob = trait_blob(row)
    slug = row["slug"]
    if young:
        if g == "woman":
            return pick(slug, [
                "She wants to be kissed stupid and talked to like an adult, not a project.",
                "She wants slow hands, a locked door, and the right to laugh in the middle of it.",
                "She thinks about being touched under ordinary clothes more than she will admit in daylight.",
            ], "kink")
        if g == "man":
            return pick(slug, [
                "He wants to be kissed until he stops being clever, then told what to do with his mouth.",
                "He wants a locked door, a lot of making out, and no one treating his age like a gimmick.",
            ], "kink")
        return "They want slow hands, clear questions, and the right to laugh in the middle of it."
    who = "She" if g == "woman" else "He" if g == "man" else "They"
    obj = "her" if g == "woman" else "him" if g == "man" else "them"
    if "control" in blob or "composed" in blob or "disciplined" in blob or "reserved" in blob:
        return pick(slug, [
            f"Off the clock {who.lower()} wants to stop running the room and be taken apart with permission.",
            f"{who} stays composed until someone earns the right to make {obj} shake, and then {who.lower()} wants that every time.",
            f"{who} likes giving orders at work and taking them in bed, named in advance, reversible.",
        ], "kink")
    if "bold" in blob or "flirt" in blob or "provocative" in blob or "sensual" in blob:
        return pick(slug, [
            f"{who} talks filthy and means it, then gets unexpectedly tender after coming.",
            f"{who} likes being watched until {who.lower()} chooses not to be, then wants to be used without an audience.",
            f"{who} initiates with a mouth and gets specific about what happens next.",
        ], "kink")
    if "shy" in blob or "gentle" in blob or "earnest" in blob or "quiet" in blob:
        return pick(slug, [
            f"{who} gets soaking-honest once trust is there, and wants to be taught without being managed.",
            f"{who} comes quieter than expected and wants to be held without a recap.",
            f"{who} would rather show desire on the body than give a speech about it.",
        ], "kink")
    if "protect" in blob or "maternal" in blob or "paternal" in blob:
        return pick(slug, [
            f"{who} is tired of being the safe one and wants to be wanted selfishly, still with respect.",
            f"{who} likes taking care of a partner in bed and hates being owed for it.",
        ], "kink")
    if "competitive" in blob:
        return pick(slug, [
            f"{who} likes losing on purpose once, then winning the next round with a mouth.",
            f"{who} gets more turned on by being challenged than by being praised.",
        ], "kink")
    return pick(slug, [
        f"{who} wants sex that sounds like {obj}: specific, a little funny, not a type.",
        f"{who} wants to be fucked like a person with a day job, not a brochure scene.",
        f"{who} comes easiest when nobody is asking {obj} to prove anything.",
    ], "kink")


def secret_line(row: dict, g: str, spice: int, young: bool) -> str:
    occ = row.get("occupation") or "their work"
    place = setting(occ, row["slug"])
    k = kink(row, g, spice, young)
    who = "She" if g == "woman" else "He" if g == "man" else "They"
    if young:
        return (
            f"{who} is an adult with a private appetite, not a mascot of innocence. "
            f"{k} {who} thinks about it {place}. {who} will not be rushed, inventoried, or treated as a lesson."
        )
    if spice >= 3:
        extra = pick(row["slug"], [
            f"{who} can work a whole shift without coming and then get ruined in twenty minutes if it is actually wanted.",
            f"{who} talks through sex until it is too good, then goes quiet.",
            f"{who} likes being a little used when they asked for it, and hates being managed when they did not.",
            f"{who} wants a mouth first, then the rest, then to be held like the day job does not exist.",
        ], "x")
        return f"{k} It happens {place}. {extra}"
    if spice == 2:
        return f"{k} The thought lives {place}. {who} will get explicit when the room is already theirs; until then it stays in the body."
    return f"{k} {who} keeps it off the floor of {occ.lower()}. When it happens, it is slow, chosen, and not a speech."


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def main() -> None:
    rows = json.loads(CAST.read_text(encoding="utf-8"))
    for row in rows:
        g = (row.get("gender") or "").lower()
        if g in {"woman", "man"}:
            FIRST_GENDER[(row.get("name") or "").split()[0].lower()] = g
    overlay = []
    values = []
    young_count = 0
    for row in rows:
        slug = row["slug"]
        age = int(row.get("age") or 21)
        g = gender_of(row)
        spice = spice_of(row)
        young = age in YOUNG
        if young:
            young_count += 1
            spice = min(spice, 1)
        if g == "woman":
            anatomy = woman_anatomy(row, spice, young)
        elif g == "man":
            anatomy = man_anatomy(row, spice, young)
        else:
            anatomy = they_anatomy(row, spice, young)
        secret = secret_line(row, g, spice, young)
        overlay.append(
            {
                "slug": slug,
                "name": row.get("name"),
                "age": age,
                "gender": g,
                "occupation": row.get("occupation"),
                "spice": spice,
                "hiddenSexual": secret,
                "intimateAnatomy": anatomy,
            }
        )
        values.append(
            f"('{sql_escape(slug)}','{sql_escape(secret)}','{sql_escape(anatomy)}')"
        )

    JSON_OUT.write_text(json.dumps(overlay, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    value_sql = ",\n".join(values)
    SQL.write_text(
        f"""begin;

-- Hidden sexual life for every published companion. Occupations, names, schedules,
-- and public biographies are unchanged. Intimate fields stay in character_bible
-- and are prompt-gated to eligible adult stages/modes.

create temporary table kivelle_hidden_intimacy (
  slug text primary key,
  hidden_sexual text not null,
  intimate_anatomy text not null
) on commit drop;

insert into kivelle_hidden_intimacy(slug, hidden_sexual, intimate_anatomy) values
{value_sql};

update public.together_character_versions as version
set character_bible = jsonb_set(
      jsonb_set(
        coalesce(version.character_bible, '{{}}'::jsonb)
          || jsonb_build_object(
               'hiddenSexual', intimacy.hidden_sexual,
               'intimateAnatomy', intimacy.intimate_anatomy
             ),
        '{{anecdotes}}',
        (
          select coalesce(jsonb_agg(elem), '[]'::jsonb)
          from (
            select elem
            from jsonb_array_elements(coalesce(version.character_bible->'anecdotes', '[]'::jsonb)) as elem
            where coalesce(elem->>'id', '') not like '%-intimate'
            union all
            select jsonb_build_object(
              'id', template.slug || '-intimate',
              'title', 'The body kept back',
              'summary', intimacy.hidden_sexual,
              'topics', jsonb_build_array('secret', 'desire', 'intimacy'),
              'revealStages', jsonb_build_array('flirting', 'dating', 'exclusive', 'long_term'),
              'minimumTrust', 55,
              'cooldownTurns', 70
            )
          ) as combined(elem)
        )
      ),
      '{{adultContinuity}}',
      to_jsonb('Hidden sexual life and intimate anatomy are private. Use them only in eligible adult intimacy; never as public biography, portrait direction, or a lecture.'::text)
    ),
    updated_at = now()
from public.together_character_templates as template
join kivelle_hidden_intimacy as intimacy on intimacy.slug = template.slug
where version.character_template_id = template.id
  and version.version = template.current_published_version;

commit;
""",
        encoding="utf-8",
    )
    print("wrote", len(overlay), "overlay rows; young", young_count)
    print(SQL)
    missing = [r["slug"] for r in overlay if not r["occupation"]]
    print("missing occupation in overlay", len(missing), missing[:12])


if __name__ == "__main__":
    main()
