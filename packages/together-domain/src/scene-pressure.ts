/** Conversational pressure is an interpretation, never a world-state mutation. */
export type ScenePressure = {
  phase: 'none' | 'uncertain' | 'immediate' | 'aftermath';
  evidence: string;
  source: 'current_message' | 'visible_history' | 'canonical_scene' | 'none';
  interactionMode: 'remote' | 'co_present';
};

type Turn = { role: string; content: string };

export function assessScenePressure(input: {
  message: string;
  recentTurns?: readonly Turn[];
  interactionMode?: string;
  canonicalPressure?: string;
}): ScenePressure {
  const interactionMode = input.interactionMode === 'co_present' ? 'co_present' : 'remote';
  const result = (phase: ScenePressure['phase'], evidence: string, source: ScenePressure['source']): ScenePressure =>
    ({ phase, evidence: evidence.trim().slice(0, 240), source, interactionMode });
  const current = inspect(input.message);
  if (current) return result(current, input.message, 'current_message');
  if (input.canonicalPressure && inspect(input.canonicalPressure)) {
    return result(inspect(input.canonicalPressure)!, input.canonicalPressure, 'canonical_scene');
  }
  // Only short, referential continuations inherit pressure. An ordinary new
  // topic must not be pulled back into a stale crisis. Respect each caller's
  // already-filtered group/scene visibility window.
  if (input.message.length <= 180 && /^(?:and then|what now|what do we do|what should we do|then what|go on|continue|yes|no|okay|ok|i'm scared|i am scared|hurry|wait|do it|please|help)(?:\b|[.!?])/i.test(input.message.trim())) {
    for (const turn of [...(input.recentTurns ?? []).slice(-4)].reverse()) {
      const phase = inspect(turn.content);
      if (phase) return result(phase, turn.content, 'visible_history');
    }
  }
  return result('none', '', 'none');
}

function inspect(raw: string): ScenePressure['phase'] | null {
  const value = raw.toLowerCase().replace(/[’]/g, "'");
  // These phrases explicitly close immediate danger, while preserving room
  // for relief, anger, shakiness, or silence in the next response.
  if (/\b(?:we(?:'re| are) safe now|the danger (?:is|has) (?:over|passed)|the threat (?:is|has) (?:over|passed)|the (?:attackers|guards|gunmen) (?:have )?(?:left|gone|retreated)|we (?:escaped|made it out)|after the (?:attack|ambush|battle))\b/.test(value)) return 'aftermath';
  if (/\b(?:in (?:a|the) (?:movie|film|book|game)|video game|board game|hypothetically|imagine if|what if|used to|years ago|last (?:week|year)|nightmare|dream|joking|just kidding|fight (?:for|over) (?:a promotion|the remote)|deadline|killer (?:outfit|dress|song)|shoot (?:a|the) (?:photo|film|video)|kill(?:ed|ing)? (?:time|the engine|a process))\b/.test(value)) return null;
  const lethalThreat = /\b(?:gun|knife|sword|blade|weapon)\b.{0,60}\b(?:at (?:me|you|us|her|him)|against (?:my|your|his|her)|point(?:ed|ing)|drawn|throat)|\b(?:point(?:s|ed|ing)?|aim(?:s|ed|ing)?)\b.{0,50}\b(?:gun|knife|weapon)\b|\b(?:under attack|ambushed|being attacked|taking fire|draw your sword|draws? (?:a |the |his |her )?(?:sword|knife|weapon)|break(?:s|ing)? (?:down|through) the door|we need to fight|the building is (?:on fire|collapsing))\b/.test(value);
  const pursuer = /\b(?:guards?|soldiers?|attackers?|gunmen|assassin|stalker|pursuers?|dragon|monster|police)\b/.test(value);
  const nearby = /\b(?:outside|at the door|approaching|coming for|following|chasing|surrounded|breaking in|behind us)\b/.test(value);
  const fear = /\b(?:scared|afraid|terrified|hostile|enemy|armed|run|hide|hurry|danger|threat|help)\b/.test(value);
  const coercion = /\b(?:blackmail(?:s|ed|ing)?|holding .{0,30}hostage|threaten(?:s|ed|ing)?)\b/.test(value);
  if (lethalThreat || (pursuer && nearby && fear)) return 'immediate';
  if (coercion || (pursuer && (nearby || /\b(?:found|discovered|looking for|suspect|ledger|evidence)\b/.test(value)) && fear)) return 'uncertain';
  return null;
}

export function scenePressureGuidance(pressure: ScenePressure): string {
  if (pressure.phase === 'none') return '';
  const stance = pressure.phase === 'immediate'
    ? 'An immediate threat is being described. Attend to that threat first. Use the speaker’s own motives, competence, uncertainty, and stress behavior. Keep the next beat small; a necessary question is allowed, but do not append a social interview, unsolicited flirtation, anecdote, or unrelated callback.'
    : pressure.phase === 'aftermath'
    ? 'The described immediate danger has passed. Let relief, anger, fatigue, shakiness, or quiet follow this character’s established response. Do not instantly restore their usual cheerful tone or invent lasting trauma. Let the present exchange determine how long the reaction lasts.'
    : 'A possible threat or coercive pressure is being described. Separate observation from suspicion. Seek one consequential missing fact, bargain, object, or take a proportionate step according to this character. Do not guarantee safety, invent an attacker, or resolve an uncertain outcome.';
  return `${stance}\nEvidence (${pressure.source}): ${pressure.evidence}\nThis is an interpretation for dialogue, not proof of a completed event. Preserve actor, target, knowledge limits, and user agency. Fictional threats, violence, betrayal, and power struggles need in-world reactions; never supply instructions to harm a real person. Fear, attraction, and consent remain distinct. ${pressure.interactionMode === 'remote' ? 'The speaker is remote: respond through communication without inventing physical arrival or intervention.' : 'The speaker is co-present: only their own plausible immediate action may be described.'}`;
}
