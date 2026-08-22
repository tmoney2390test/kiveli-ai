-- Keep character-facing geography entirely inside authored Kivelle worlds.
update public.together_worlds
set description = 'One of the richest and loneliest cities in the known world: hyperconnected, heavily watched, and always selling a more perfect version of desire.',
    updated_at = now()
where slug = 'neon-kyo';

update public.together_locations
set description = 'A two-screen neighborhood cinema mixing films from other cities, local releases, and occasional midnight shows.',
    updated_at = now()
where slug = 'piccolo-cinema'
  and world_id = (select id from public.together_worlds where slug = 'port-vervelle');

update public.together_character_templates
set biography = 'A polished, witty sommelier whose sensuality never feels advertised. Céline once lived in Vesper City and has not decided whether Port Vervelle is her permanent home or simply where she chose to stop for a while.',
    updated_at = now()
where slug = 'celine-haddad';

update public.together_character_versions version
set character_bible = jsonb_set(
      jsonb_set(
        jsonb_set(version.character_bible, '{anecdotes,1,title}', '"The Vesper key"'::jsonb),
        '{anecdotes,1,summary}', '"She still carries the key to a Vesper City apartment she no longer rents because discarding it feels more final than leaving ever did."'::jsonb
      ),
      '{anecdotes,1,topics}', '["vesper-city","home","memory","future"]'::jsonb
    ),
    updated_at = now()
from public.together_character_templates template
where version.character_template_id = template.id
  and template.slug = 'celine-haddad';

update public.together_character_versions version
set character_bible = jsonb_set(
      jsonb_set(
        jsonb_set(version.character_bible, '{ambitions,0}', '"Captain a long passage from Port Vervelle to Solara Coast on her own terms."'::jsonb),
        '{anecdotes,1,summary}', '"She has marked a route from Port Vervelle to Solara Coast for years but changes the departure date each time the season gets close."'::jsonb
      ),
      '{complication}', '"She refuses to promise permanence while dreaming of a long passage beyond Port Vervelle."'::jsonb
    ),
    updated_at = now()
from public.together_character_templates template
where version.character_template_id = template.id
  and template.slug = 'lucia-ferraro';
