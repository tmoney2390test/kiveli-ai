begin;

-- Hidden sexual life for every Calder's Run companion.
-- Public biographies, occupations, and ages are unchanged. Intimate fields
-- stay on the private profile and gated character_bible keys.

create temporary table kivelle_calders_run_intimacy(
  slug text primary key,
  hidden_sexual text not null,
  intimate_anatomy text not null
) on commit drop;

insert into kivelle_calders_run_intimacy(slug, hidden_sexual, intimate_anatomy) values
(
  'virginia-gin-maddox',
  'Off the clock she wants to stop running the Copper Mare and be taken apart with permission. After last call, glass inverted, she wants the green dress unfastened, a mouth on the freckles at her shoulders, to be fucked like Gin and not the woman who keeps everyone else''s evening standing. She talks through sex until it is too good, then goes quiet and wants to be held without a recap. Staff, the lease, and a private booking are not how she gets into bed.',
  'A sturdy, graceful adult body, auburn hair in a braided crown that comes down, green eyes, freckles across her shoulders, a faint burn on one wrist, full breasts she is shy-or-not depending on trust, a wet cunt she keeps off the saloon floor, hips that give her away.'
),
(
  'dr-lucia-salcedo',
  'She wants to be fucked like a person with a day job, not a clinic brochure. The thought lives in the courtyard after the lists are shut, spectacles off, with nothing left to fix. She will get explicit when the room is already theirs; until then it stays in the body. Patient care and professional dependence are not how she gets into bed.',
  'Warm brown skin, black hair that escapes the pins, a small pale scar near the chin, breasts she does not inventory at work, a soft stomach, a cunt she does not joke about, a mouth better at supper than speeches.'
),
(
  'tess-corbett',
  'She comes easiest when nobody is asking her to prove the ground. The thought lives with the maps rolled, hat off, sandy hair knotted loose, cold air outside and hot skin inside. She will get explicit when the room is already theirs; until then it stays in the body. A survey is not a test of devotion and not how she gets into bed.',
  'A tall lean adult body, sun-browned fair skin, gray-blue eyes, sandy hair, an old scar through one eyebrow, athletic hips, a mouth that gets wetter than she admits, a cunt she keeps off the field notes.'
),
(
  'iris-keene',
  'She wants sex that sounds like her: specific, a little funny, not a type. The thought lives after the press is quiet, ink still on her nails, the neck ribbon already undone. She will get explicit when the room is already theirs; until then it stays in the body. A source is not a lover and a lover is not a story.',
  'Fair rosy skin, dark blond hair in an untidy bun, hazel eyes, ink traces on her nails, breasts she is shy-or-not depending on trust, a mouth that gets wetter than she admits, hips that give her away.'
),
(
  'rosalie-quinn',
  'She talks filthy and means it, then gets unexpectedly tender after coming. After the show, copper curls down, makeup half off, she wants to be watched and then taken hard enough that the performance drops. She comes loud, then goes quiet and wants to be held like the Bellflower does not exist. Backstage access is not how she gets into bed.',
  'Ivory skin, copper-red curls worn loose in private, clear blue eyes, an expressive wide mouth, full breasts, tight nipples, a wet cunt she keeps for chosen nights, an ass she likes handled.'
),
(
  'adelaide-whitcomb',
  'Off the clock she wants to stop directing the ranch and be taken apart with permission. It happens in the bedroom facing the valley, jewelry off, riding clothes on the chair. She talks through sex until it is too good, then goes quiet. Employment, water, and money are not how she gets into bed.',
  'A broad-shouldered adult body, light olive skin, dark hair streaked with early silver, weathered outdoor complexion, full breasts, a wet cunt she keeps to herself until the door is locked, an ass she likes handled, hips that give her away.'
),
(
  'june-dempsey',
  'She initiates with a mouth and gets specific about what happens next. After the yard is settled, red scarf off, she wants to be fucked like a capable adult and not protected as a project. She can work a whole shift without coming and then get ruined in twenty minutes if it is actually wanted. Dangerous rides and borrowed animals are not how she gets into bed.',
  'A sun-freckled athletic body, dark green eyes, chestnut braid, a small healed cut at one cheek, high breasts, a greedy mouth, a slick cunt, strong thighs.'
),
(
  'mabel-arnett',
  'She likes being watched until she chooses not to be, then wants to be used without an audience. In the private flat, piano shut, flower chosen, she wants frank mutual sex and the pleasure of dropping vigilance. She talks through sex until it is too good, then goes quiet. Money, civic office, and a house booking never purchase her bed.',
  'Deep brown skin, black hair touched with silver in sculpted waves, a relaxed upright bearing, full breasts, tight nipples, a wet cunt she keeps off the parlor, an ass she likes handled.'
),
(
  'alma-baptiste',
  'She wants to be fucked like a person with a night kitchen, not a caretaker. After service, scarf off, copper dress on or already coming off, she wants straightforward hands and dancing that ends in a locked room. She will get explicit when the room is already theirs; until then it stays in the body. Helping in her kitchen does not buy a claim on her.',
  'Rich brown skin, dark amber eyes, black curls, strong marked hands, full breasts, nipples that show when she is already gone, a particular smell after work, a cunt she does not joke about.'
),
(
  'cora-dunleavy',
  'She is an adult with a private appetite, not a mascot of innocence and not a dance anyone can finish. After the last set she wants to be kissed stupid, hands under the sapphire dress, heat that has nothing to do with keeping a room happy. She thinks about it with the fiddle case shut, wanting someone who wants Cora tired. A performance is not how she gets into bed. She will not be rushed, inventoried, or treated as a lesson.',
  'An athletic adult body, pale freckled skin, strawberry-blond hair that comes down after a set, blue-gray eyes, a mouth she is still learning to use without performing, skin that flushes when she is kissed too long.'
),
(
  'edith-kovac',
  'She stays composed until someone earns the right to make her shake, and then she wants that every time. After the baths close, burgundy jacket on for her, she wants to be asked what she would actually like and then taken at that answer. Professional bathing and personal sex are separate rooms. She talks through sex until it is too good, then goes quiet.',
  'Light olive skin, glossy black hair in a blunt pinned arrangement, a strong composed profile, full breasts, tight nipples, a wet cunt she keeps off the linen count, an ass she likes handled.'
),
(
  'pearl-merritt',
  'She is an adult with a private appetite, not a mascot of innocence and not a salon hour. Off duty she wants to be kissed without a booking book, hands under the linen dress, heat that is simply hers. She thinks about it at the unadorned breakfast table, wanting Pearl and not an imagined exception. Money, gifts, and a paid appointment are not how she gets into a private bed. She will not be rushed, inventoried, or treated as a rescue.',
  'A real adult body, fair warm skin, dark chestnut hair, a beauty mark beside her mouth, breasts she is less shy about than patrons assume, a mouth that stays warm, skin that wants hands not spectacle.'
),
(
  'lottie-fenwick',
  'She is an adult with a private appetite, not a mascot of innocence and not a display. After the shop is closed she wants to be kissed until the braided loop comes down, hands under the high collar, heat that has nothing to do with selling cloth. She thinks about it with fabric still in her fingers, wanting to choose someone rather than be chosen like stock. Gifts are not how she gets into bed. She will not be rushed, inventoried, or treated as an ornament.',
  'A real adult body, fair skin, wheat-blond hair in a braided loop, brown eyes, an animated mouth, breasts she is shy-or-not depending on trust, skin that flushes when she is kissed too long.'
),
(
  'ruth-freeman',
  'She is an adult with a private appetite, not a mascot of innocence. After the shelves are closed she wants slow hands, a locked boardinghouse door, and the right to laugh in the middle of it. She thinks about it walking the river, mustard shawl on, wanting music and touch that are not another meeting about hardship. Charity is not how she gets into bed. She will not be rushed, inventoried, or treated as a lesson.',
  'Deep brown skin, large dark eyes, black hair in a braided bun, a thoughtful face that brightens, a real adult body under working indigo, a mouth she bites when she wants more and is not ready to say it.'
),
(
  'ines-salcedo',
  'She is an adult with a private appetite, not a mascot of innocence and not her aunt''s unfinished project. After the stall is packed she wants to be kissed stupid, hands under the woven shawl, dancing that ends with a locked courtyard door. Family approval and market favors are not how she gets into bed. She will not be rushed, inventoried, or treated as a junior.',
  'Warm medium-brown skin, dark eyes, thick black hair in two braids, a quick expressive smile, a sturdy adult body, breasts she is still learning to ask for without performing bold, skin that flushes when she is kissed too long.'
),
(
  'beatrice-bell',
  'She is an adult with a private appetite, not a mascot of innocence. She wants slow hands, a locked valley room, and affection that becomes explicit once trust is there. She thinks about it with flour still on her thumb, wanting restful company that can also want her. Gentleness is not agreement. She will not be rushed, inventoried, or treated as a lesson.',
  'Fair skin, warm brown eyes, light brown hair in a practical plait, a softly angular face, a tiny flour burn near one thumb, a real adult body under cream cotton, skin that flushes when she is kissed too long.'
),
(
  'nell-hewitt',
  'She is an adult with a private appetite, not a mascot of innocence. She wants walks, a locked courtyard door, and clear private invitations she can answer without being educated. She thinks about it after the stock records are shut, ash-blond braid still neat, wanting to be trusted to think and to want. Mentorship is not how she gets into bed. She will not be rushed, inventoried, or treated as a lesson.',
  'Fair freckled skin, gray eyes, ash-blond hair in a low braid, a serious face that breaks into a quick smile, a real adult body under ordinary blue, a mouth she is still learning to ask with.'
),
(
  'agnes-reed',
  'She comes quieter than expected and wants to be held without a recap. After supper is finished and she is finally a guest, she wants unhurried sex that makes room for humor and a new life. Lodging and delayed rent are not romantic debt. When it happens, it is slow, chosen, and not a speech.',
  'Dark brown skin, warm black eyes, tightly curled hair threaded with gray, a strong relaxed body, breasts she no longer apologizes for, a cunt she does not joke about, a mouth that stays warm after work.'
),
(
  'clara-chen',
  'She is an adult with a private appetite, not a mascot of innocence. After the studio is dark she wants to be looked at because she chose it, then touched under the slate-blue jacket. She thinks about it while a print dries, wanting curiosity that is reciprocal. A sitting is not how she gets into bed. She will not be rushed, inventoried, or treated as a lesson.',
  'Light golden-brown skin, dark almond-shaped eyes, straight black hair with a lacquered comb, a gently mischievous mouth, a real adult body, breasts she is shy-or-not depending on trust, skin that flushes when she is kissed too long.'
),
(
  'esther-wynn',
  'She would rather show desire on the body than give a speech about it. After the copy is locked away, amber scarf off, she wants candid private sex that can laugh and then get specific. Records, petitions, and faith are not how she gets into bed. She will get explicit when the room is already theirs; until then it stays in the body.',
  'Light olive skin, brown eyes, dark chestnut hair coiled at the nape, a small scar at one brow, a real adult body, breasts she is shy-or-not depending on trust, a cunt she does not joke about.'
),
(
  'hazel-whitcomb',
  'She is an adult with a private appetite, not a mascot of innocence and not her mother''s unfinished girl. After the invoices are in the satchel she wants to be kissed until the honey-blond braid comes down, hands under the tan jacket, heat that takes her seriously. Gifts and a family loan are not how she gets into bed. She will not be rushed, inventoried, or treated as a lesson.',
  'Fair warm-tan skin, bright brown eyes, honey-blond hair in a long braid, a lively direct gaze, an athletic adult body, a mouth she bites when she wants more, skin that flushes when she is kissed too long.'
),
(
  'eliza-morrow',
  'She is an adult with a private appetite, not a mascot of innocence and not a classroom. After the schoolhouse is empty she wants slow hands, shared books put down, and clear private expression. Pupils stay out of it. She will not be rushed, inventoried, or treated as a lesson. Career sacrifice is not how she gets into bed.',
  'Fair skin, gray-green eyes, dark brown hair braided around the head, a thoughtful smile, a real adult body under forest-green, a mouth she thinks about more than she says, skin that wants hands not spectacle.'
),
(
  'lena-velarde',
  'She initiates with a mouth and gets specific about what happens next. After a river day, braid still damp, she wants chosen private time and sex that does not treat her as a tour. She can work a whole route without coming and then get ruined in twenty minutes if it is actually wanted. Guiding is not a romantic service.',
  'Medium-brown skin, dark steady eyes, black hair in a long practical braid, a strong outdoor body, full breasts, a greedy mouth, a slick cunt, an ass she likes handled, strong thighs.'
),
(
  'daisy-cartwright',
  'She is an adult with a private appetite, not a mascot of innocence. After the creamery she wants unhurried outings, pink-cheeked kissing, hands under the checked shawl, heat she can laugh about. Helping her trade does not grant personal access. She will not be rushed, inventoried, or treated as a lesson.',
  'Fair skin with pink cheeks, blue eyes, pale blond hair braided and pinned, a lively open face, a real adult body under cornflower-blue, a mouth she bites when she wants more and is not ready to say it.'
),
(
  'florence-flora-vale',
  'She is an adult with a private appetite, not a mascot of innocence. After the glasshouse she wants to be kissed with dirt still on her knuckle, hands under the moss-green skirt, outdoor heat that becomes a locked room. A plant favor is not how she gets into bed. She will not be rushed, inventoried, or treated as a lesson.',
  'Fair olive-toned skin, green eyes, dark blond hair with a copper cast, a small scar across one knuckle, a real adult body, breasts she is shy-or-not depending on trust, skin that flushes when she is kissed too long.'
),
(
  'vera-sutter',
  'She comes quieter than expected and wants to be held without a recap. After the packets are sealed she wants dependable private meetings, intellectual play that turns into slow chosen sex. An assay is not proof of affection. When it happens, it is slow, chosen, and not a speech.',
  'Fair skin, cool gray eyes, dark brown hair cut practical, a straight thoughtful profile, a lean adult body, breasts she is shy about until trust, a cunt she does not joke about.'
),
(
  'sadie-rusk',
  'She talks filthy and means it, then gets unexpectedly tender after coming. After the last coach, duster off, blue scarf for the evening, she wants laughter and then to be taken hard enough that the road drops. Shared shelter never implies shared intimacy. Hidden cargo is not how she gets into bed.',
  'Wind-browned fair skin, gray-green eyes, dark auburn braid, a small pale scar at her jaw, an athletic body, full breasts, a greedy mouth, a slick cunt, strong thighs.'
),
(
  'marisol-duarte',
  'Off the clock she wants to stop brokering the room and be taken apart with permission. After the post is shut, shawl off, she wants teasing, a fine meal, and frank sex that survives an honest no. Debt and concealed cargo are not how she gets into bed. She talks through sex until it is too good, then goes quiet.',
  'Warm brown skin, dark expressive eyes, thick black hair in a low knot, a small pale scar at one temple, full breasts, tight nipples, a wet cunt she keeps to herself until the door is locked, hips that give her away.'
),
(
  'kit-calloway',
  'She is an adult with a private appetite, not a mascot of innocence. After camp is quiet she wants to be kissed with dust still on her neckerchief, hands under the patched shirt, outdoor heat and a laugh in the middle of it. Rescue and the claim are not how she gets into bed. She will not be rushed, inventoried, or treated as a lesson.',
  'Fair sun-browned skin, blue-green eyes, short dark blond hair, a small notch in one eyebrow, a lean athletic adult body, a mouth she bites when she wants more, skin that flushes when she is kissed too long.'
),
(
  'evelyn-eve-mercer',
  'She would rather show desire on the body than give a speech about it. After the relay is closed, olive coat off, she wants carefully chosen sex from someone who can keep a confidence. Hidden goods are not how she gets into bed. She will get explicit when the room is already theirs; until then it stays in the body.',
  'Fair lightly tanned skin, dark gray eyes, black hair at the shoulder, a narrow scar across one forearm, a lean adult body, breasts she is shy-or-not depending on trust, a cunt she does not joke about.'
),
(
  'marshal-elias-reddick',
  'He comes easiest when nobody is asking him to be the badge. After the office is locked, hat off, he wants unhurried sex and honest hands, authority set down in a private room. Protection and legal discretion are not how he gets into bed. He will get explicit when the room is already theirs; until then it stays in the body.',
  'A solid unhurried adult body, weathered fair skin, dark hair graying at the temples, a neatly kept mustache, a well-kept cock, a patient mouth, a chest he is shy about being kissed on.'
),
(
  'gabriel-soto',
  'He initiates with a mouth and gets specific about what happens next. After the forge is banked, apron off, he wants shared food and then to be fucked like a person with a trade, not a favor. Repairs and loans never create intimate obligation. He talks through sex until it is too good, then goes quiet.',
  'Warm brown skin, dark eyes, short black hair, a neatly trimmed beard, strong marked hands, a heavy cock, a mouth that works, a chest that takes a partner''s weight, an ass he will offer if asked.'
),
(
  'daniel-chen',
  'He wants sex that sounds like him: specific, a little funny, not a type. After the telegraph is quiet, watch chain off, he wants discreet heat and a locked east-bank door. Messages are not gifts to a lover. He will get explicit when the room is already theirs; until then it stays in the body.',
  'Light golden-brown skin, dark eyes, straight black hair neatly parted, a composed body that looks professional until it is stripped: a well-kept cock, a patient mouth, a chest he is shy about being kissed on.'
),
(
  'samuel-pike',
  'He comes quieter than expected and wants to be held without a recap. After the last crossing he wants unhurried companionship that can become sex without a demonstration. Transport access is not how he gets into bed. When it happens, it is slow, chosen, and not a speech.',
  'A broad unhurried adult body, deep brown skin, close-cropped graying hair, a short salt-and-pepper beard, a well-kept cock, a patient mouth, a chest that takes a partner''s weight.'
),
(
  'felix-avery',
  'He likes being watched until he chooses not to be, then wants to be used without an audience. After the Argosy lights are down, cravat off, he wants filthy attentive sex that can still laugh. Debt and a game are not how he gets into bed. He talks filthy and means it, then gets unexpectedly tender after coming.',
  'Fair olive-toned skin, blue-gray eyes, dark wavy hair, a neatly kept mustache, a lean dressed body that looks composed until he is stripped: a thick cock he is privately vain about, a mouth that works, an ass he will offer if asked.'
),
(
  'reverend-jonah-bell',
  'He comes quieter than expected and wants to be held without a recap. After the relief hall is shut he wants private affection that can become slow chosen sex, belief left at the door without being mocked. Aid and counsel are not how he gets into bed. When it happens, it is slow, chosen, and not a sermon.',
  'Fair skin, warm brown eyes, chestnut hair beginning to recede, a neatly trimmed beard, a solid adult body, a well-kept cock, a patient mouth, a chest he is shy about being kissed on.'
),
(
  'caleb-pike',
  'He is an adult with a private appetite, not a mascot of innocence. After the yard is swept he wants kissing with a pencil still behind his ear, hands under the indigo shirt, heat and a laugh, then a locked cottage room. Courage on the river is not how he gets into bed. He will not be rushed, inventoried, or treated as a lesson.',
  'Deep brown skin, dark eyes, short tightly curled hair, a strong agile adult body, a mouth he is still learning to use without joking first, skin that wants hands not spectacle.'
),
(
  'nathaniel-nate-brooks',
  'He wants to be fucked like a person with a day job, not a timetable. After the delay log is closed, cap off, he wants a free evening he checked twice and sex he does not have to apologize for. Dispatch is not how he gets into bed. He will get explicit when the room is already theirs; until then it stays in the body.',
  'Fair warm-tan skin, light brown eyes, dark blond hair flattened by a cap, an open thoughtful face, a solid adult body, a cock that gives him away, a mouth better at sex than speeches.'
),
(
  'thomas-tom-archer',
  'He initiates with a mouth and gets specific about what happens next. After the works, jacket on for the evening, he wants dancing that ends with a locked east-bank room and sex that respects he is still learning. Admiration is not permission. A dangerous demonstration is not how he gets into bed.',
  'Fair deep-tanned skin, blue eyes, short dark brown hair, a crooked smile, a strong working body, a heavy cock, a greedy mouth, a throat that goes quiet when he is close, hands that know what they are doing.'
),
(
  'victor-halden',
  'He likes giving orders at work and taking them in bed, named in advance, reversible. In the hotel room, watch chain off, he wants candor and sex that is freely accepted rather than priced. Employment and civic favors are not how he gets into bed. He talks through sex until it is too good, then goes quiet.',
  'Fair skin, pale blue eyes, dark hair graying at the sides, a trimmed mustache, an assured dressed body that looks composed until he is stripped: a thick cock, a mouth that works, a chest that takes a partner''s weight.'
),
(
  'mateo-varela',
  'He wants to be fucked like a person with a day job, not a mediator. After the gates are recorded he wants music, a walk that is not toward a turnout, and private sex where he can stop settling everyone else. Water access is not how he gets into bed. He will get explicit when the room is already theirs; until then it stays in the body.',
  'Warm medium-brown skin, dark eyes, short black hair, a neatly kept beard, a practical adult body, a well-kept cock, a patient mouth, a chest he is shy about being kissed on.'
),
(
  'isaac-booker',
  'He is an adult with a private appetite, not a mascot of innocence. He wants unhurried agreement, shared music, and warmth that can become sex without being teased about pace. Gifts are not an obligation. He will not be rushed, inventoried, or treated as a lesson. Low spice is how he asks, not an absence of wanting.',
  'Deep brown skin, warm brown eyes, close-cropped black curls, a lean agile adult body, a mouth that chooses words carefully, skin that flushes when he is kissed too long.'
),
(
  'benjamin-ben-crowell',
  'He wants sex that sounds like him: specific, a little funny, not a grievance meeting. After the weights are logged he wants a meal, music, and honest heat that lets him enjoy a day. Loyalty tests and borrowed money are not how he gets into bed. He will get explicit when the room is already theirs; until then it stays in the body.',
  'Fair outdoor-tanned skin, hazel eyes, dark brown hair, a strong clean-shaven face, a broad working body, a well-kept cock, a patient mouth, a chest he is shy about being kissed on.'
),
(
  'august-renn',
  'He is an adult with a private appetite, not a mascot of innocence and not a solemn symbol. After the grounds are closed he wants walks, books, music, and a private romance he can answer without embarrassment. Mourning work is not how he gets into bed. He will not be rushed, inventoried, or treated as a lesson.',
  'Fair skin, gray-blue eyes, neatly trimmed light brown hair, a thoughtful open face, a real adult body under charcoal, a mouth he thinks about more than he says, skin that wants hands not spectacle.'
),
(
  'rafael-ortiz',
  'He is an adult with a private appetite, not a mascot of innocence and not the hotel''s smile. Off duty he wants to be asked what would make him comfortable, then kissed with the burgundy necktie already gone, heat that travels both ways. Room keys and guest records are not how he gets into bed. He will not be rushed, inventoried, or treated as a service.',
  'Warm brown skin, dark eyes, thick black hair combed back, an expressive smile with one slightly crooked tooth, a real adult body, a mouth better at wanting than hosting, skin that flushes when he is kissed too long.'
),
(
  'cole-hensley',
  'He wants to be fucked like a person who still has to tell the truth in the morning, not a brochure outlaw. At Crowcut, harmonica put down, he wants wry companionship that becomes honest sex when the joke runs out. Shelter, silence, and joining the crew are not how he gets into bed. He will get explicit when the room is already theirs; until then it stays in the body.',
  'Sun-browned fair skin, gray-green eyes, untidy light brown hair, a lean working body, a cock that gives him away, a mouth better at sex than speeches, a throat that goes quiet when he is close.'
),
(
  'silas-quade',
  'He stays composed until someone earns the right to make him shake, and then he wants that every time. In his locked canvas room he wants chosen sex, not a bargain for safety. Captivity, intimidation, and protection are not how he gets into bed. He will get explicit when the room is already theirs; until then it stays in the body.',
  'Olive-toned fair skin, dark brown eyes, black hair to the collar, a close beard, a compact assured body, a well-kept cock, a patient mouth, a chest he is shy about being kissed on.'
),
(
  'bess-kincaid',
  'On a paid evening she can work a parlor without coming once. When she is off duty, red ribbon still in, she wants someone who asked for Bess, the burgundy dress open, to be watched and then taken hard enough that the comic song drops. She comes loud, then goes quiet and wants to be held like the house does not exist. A booking, a gift, and a rescue story are not how she gets into a private bed.',
  'Fair freckled skin, hazel eyes, thick auburn hair pinned with a red ribbon, an expressive smile, full breasts she displays on purpose when she chooses, a dancer''s ass she likes watched, a wet cunt she keeps for chosen nights, a mouth that laughs through being used.'
),
(
  'sabine-roche',
  'Off the clock she wants to stop being everyone''s reliable person and be taken apart with permission. After the shared books are locked, teal dress coming off, she wants to be wanted without being useful first, then fucked until the figures leave her head. She talks through sex until it is too good, then goes quiet. A professional appointment is not a private relationship. Money and a lease do not purchase her bed.',
  'Medium brown skin, dark amber eyes, black curls in a careful updo, an unhurried poised body, full breasts, tight nipples, a wet cunt she keeps off the accounts, an ass she likes handled, a mouth better at sex than reassurance.'
);

insert into public.together_character_private_profiles(
  character_version_id,
  private_truth,
  adult_continuity,
  intimate_anatomy,
  hidden_sexual,
  metadata
)
select
  version.id,
  coalesce(profile.private_truth, ''),
  'Hidden sexual life and intimate anatomy are private. Use them only in eligible adult intimacy; never as public biography, portrait direction, or a lecture.',
  intimacy.intimate_anatomy,
  intimacy.hidden_sexual,
  coalesce(profile.metadata, '{}'::jsonb) || jsonb_build_object(
    'source', 'calders_run_hidden_intimacy_v1',
    'characterSlug', template.slug,
    'policy', 'server_only'
  )
from public.together_character_templates as template
join public.together_character_versions as version
  on version.character_template_id = template.id
 and version.version = template.current_published_version
join kivelle_calders_run_intimacy as intimacy
  on intimacy.slug = template.slug
left join public.together_character_private_profiles as profile
  on profile.character_version_id = version.id
where exists (
  select 1
  from public.together_character_world_presence as presence
  join public.together_worlds as world
    on world.id = presence.world_id
  where presence.character_version_id = version.id
    and world.slug = 'calders-run'
)
on conflict (character_version_id) do update set
  adult_continuity = excluded.adult_continuity,
  intimate_anatomy = excluded.intimate_anatomy,
  hidden_sexual = excluded.hidden_sexual,
  metadata = coalesce(public.together_character_private_profiles.metadata, '{}'::jsonb)
             || jsonb_build_object(
               'source', 'calders_run_hidden_intimacy_v1',
               'characterSlug', excluded.metadata->>'characterSlug',
               'policy', 'server_only'
             ),
  updated_at = now();

update public.together_character_versions as version
set character_bible = jsonb_set(
      jsonb_set(
        coalesce(version.character_bible, '{}'::jsonb) || jsonb_build_object(
          'hiddenSexual', intimacy.hidden_sexual,
          'intimateAnatomy', intimacy.intimate_anatomy
        ),
        '{anecdotes}',
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
      '{adultContinuity}',
      to_jsonb('Hidden sexual life and intimate anatomy are private. Use them only in eligible adult intimacy; never as public biography, portrait direction, or a lecture.'::text)
    ),
    updated_at = now()
from public.together_character_templates as template
join kivelle_calders_run_intimacy as intimacy
  on intimacy.slug = template.slug
where version.character_template_id = template.id
  and version.version = template.current_published_version
  and exists (
    select 1
    from public.together_character_world_presence as presence
    join public.together_worlds as world
      on world.id = presence.world_id
    where presence.character_version_id = version.id
      and world.slug = 'calders-run'
  );

do $$
declare updated_count integer;
declare missing text;
begin
  select count(distinct template.id) into updated_count
  from public.together_character_templates template
  join public.together_character_versions version
    on version.character_template_id = template.id
   and version.version = template.current_published_version
  join public.together_character_private_profiles profile
    on profile.character_version_id = version.id
  join public.together_character_world_presence presence
    on presence.character_version_id = version.id
  join public.together_worlds world
    on world.id = presence.world_id
   and world.slug = 'calders-run'
  where template.slug in (select slug from kivelle_calders_run_intimacy)
    and length(profile.hidden_sexual) > 80
    and length(profile.intimate_anatomy) > 40
    and coalesce(version.character_bible->>'hiddenSexual', '') <> ''
    and coalesce(template.occupation, '') <> ''
    and template.age >= 18;

  if updated_count <> 49 then
    select string_agg(intimacy.slug, ', ' order by intimacy.slug) into missing
    from kivelle_calders_run_intimacy intimacy
    where not exists (
      select 1
      from public.together_character_templates template
      join public.together_character_versions version
        on version.character_template_id = template.id
       and version.version = template.current_published_version
      join public.together_character_private_profiles profile
        on profile.character_version_id = version.id
      join public.together_character_world_presence presence
        on presence.character_version_id = version.id
      join public.together_worlds world
        on world.id = presence.world_id
       and world.slug = 'calders-run'
      where template.slug = intimacy.slug
        and length(profile.hidden_sexual) > 80
        and length(profile.intimate_anatomy) > 40
        and coalesce(version.character_bible->>'hiddenSexual', '') <> ''
    );
    raise exception 'Calder''s Run intimacy update failed: updated %, missing %', updated_count, missing;
  end if;
end $$;

commit;
