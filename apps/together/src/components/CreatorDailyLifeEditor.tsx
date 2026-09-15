import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ChevronRight, Plus, RefreshCw, Trash2 } from "lucide-react-native";
import { CreatorModal, CreatorPicker } from "./CreatorPicker";
import {
  buildCreatorWeek,
  routineInputKey,
  routinePreset,
  routinePresets,
} from "@together/domain/src/creator-routine";
import { routineConflicts } from "@together/domain/src/creator";
import { nextCreatorRoutineSlot } from "../lib/creatorWizard";
import { createClientRequestId } from "../lib/requestId";
import { confirmAction } from "../lib/dialogs";
import { colors } from "../theme";
import type {
  CreatorDraft,
  CreatorIdentityConfig,
  CreatorLifeConfig,
  CreatorRoutineBlock,
} from "../types";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const time = (n: number) =>
  n === 1440
    ? "Midnight (end of day)"
    : new Date(2000, 0, 1, Math.floor(n / 60), n % 60).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
const groupKey = (b: CreatorRoutineBlock) =>
  JSON.stringify([
    b.startMinute,
    b.endMinute,
    b.locationId,
    b.activity,
    b.availability,
    b.energyDelta,
    b.moodInfluence,
  ]);
function groups(blocks: CreatorRoutineBlock[]) {
  const result = new Map<string, CreatorRoutineBlock[]>();
  for (const b of blocks) {
    const key = groupKey(b);
    result.set(key, [...(result.get(key) || []), b]);
  }
  return [...result.values()].sort((a, b) =>
    Math.min(...a.map((v) => (v.dayOfWeek + 6) % 7)) -
      Math.min(...b.map((v) => (v.dayOfWeek + 6) % 7)) ||
    a[0]!.startMinute - b[0]!.startMinute
  );
}
function dayLabel(blocks: CreatorRoutineBlock[]) {
  const selected = blocks.map((b) => b.dayOfWeek).sort((a, b) =>
    (a + 6) % 7 - (b + 6) % 7
  );
  return selected.join(",") === "1,2,3,4,5"
    ? "Mon–Fri"
    : selected.length === 7
    ? "Every day"
    : selected.map((day) => days[day]).join(", ");
}
type Props = {
  draft: CreatorDraft;
  identity: CreatorIdentityConfig;
  life: CreatorLifeConfig;
  routine: CreatorRoutineBlock[];
  onLife: (value: CreatorLifeConfig) => void;
  onRoutine: (value: CreatorRoutineBlock[]) => void;
};
export function CreatorDailyLifeEditor(
  { draft, identity, life, routine, onLife, onRoutine }: Props,
) {
  const [week, setWeek] = useState(0),
    [activity, setActivity] = useState(""),
    [preview, setPreview] = useState<CreatorRoutineBlock[] | null>(null);
  const [editor, setEditor] = useState<
    {
      blocks: CreatorRoutineBlock[];
      value: CreatorRoutineBlock;
      days: number[];
    } | null
  >(null);
  const signature = routineInputKey(life, identity.occupation),
    builtFrom = useRef<Record<number, string>>({
      0: signature,
      1: signature,
      2: signature,
    });
  const [revision, setRevision] = useState(0);
  void revision;
  const weeks = Math.max(1, ...routine.map((b) => (b.weekIndex ?? 0) + 1));
  const current = routine.filter((b) => (b.weekIndex ?? 0) === week),
    locations = draft.locations ?? [];
  const homes = locations.filter((l) =>
    ["region", "district", "neighborhood"].includes(l.location_type)
  );
  const workplaces = locations.filter((l) =>
    !["residence", "region", "district", "neighborhood", "transit"].includes(
      l.location_type,
    )
  );
  const preset = routinePreset(life.scheduleStyle);
  const mismatch = signature !== builtFrom.current[week] ||
    (preset === "home" &&
      current.some((b) => /^Working as /i.test(b.activity)));
  const setLife = (patch: Partial<CreatorLifeConfig>) =>
    onLife({ ...life, ...patch });
  const addActivity = (text: string) => {
    const value = text.trim();
    if (
      value && value.length <= 80 && life.preferredActivities.length < 10 &&
      !life.preferredActivities.some((a) =>
        a.toLowerCase() === value.toLowerCase()
      )
    ) setLife({ preferredActivities: [...life.preferredActivities, value] });
    setActivity("");
  };
  const suggestions = [
    ...new Set([
      ...identity.interests,
      ...locations.flatMap((l) => l.possible_activities ?? []),
    ]),
  ].filter((a) =>
    typeof a === "string" && a.length <= 40 &&
    !life.preferredActivities.includes(a)
  ).slice(0, 6);
  const build = () => {
    const interest = life.preferredActivities[0]?.toLowerCase() || "";
    const place = workplaces.find((l) =>
      interest &&
      [l.name, l.category, l.description].join(" ").toLowerCase().includes(
        interest,
      )
    );
    setPreview(buildCreatorWeek({
      weekIndex: week,
      preset,
      description: life.lifestyle,
      occupation: identity.occupation,
      activities: life.preferredActivities,
      homeLocationId: life.homeLocationId,
      workLocationId: life.workLocationId,
      socialLocationId: place?.id || life.homeLocationId,
      id: createClientRequestId,
    }));
  };
  const addWeek = () => {
    if (weeks >= 3) return;
    onRoutine([
      ...routine,
      ...current.map((b) => ({
        ...b,
        id: createClientRequestId(),
        weekIndex: weeks,
      })),
    ]);
    setWeek(weeks);
  };
  const removeWeek = () =>
    confirmAction({
      title: "Remove Week " + (week + 1) + "?",
      message:
        "Its schedule blocks will be removed. Other weeks will stay in order.",
      confirmLabel: "Remove week",
      destructive: true,
      onConfirm: () => {
        onRoutine(
          routine.filter((b) => (b.weekIndex ?? 0) !== week).map((b) => ({
            ...b,
            weekIndex: (b.weekIndex ?? 0) > week
              ? (b.weekIndex ?? 0) - 1
              : b.weekIndex ?? 0,
          })),
        );
        setWeek(Math.max(0, week - 1));
      },
    });
  const openNew = () => {
    const slot = nextCreatorRoutineSlot(current);
    if (!slot) return;
    setEditor({
      blocks: [],
      days: [slot.dayOfWeek],
      value: {
        id: createClientRequestId(),
        weekIndex: week,
        ...slot,
        locationId: life.homeLocationId,
        activity: "Personal time",
        availability: "available",
        energyDelta: 0,
      },
    });
  };
  const changes = editor
    ? editor.days.map((day) => ({
      ...editor.value,
      id: editor.blocks.find((b) => b.dayOfWeek === day)?.id ||
        editor.value.id + "-" + day,
      dayOfWeek: day,
      weekIndex: week,
    }))
    : [];
  const edited = current.filter((b) =>
    !editor?.blocks.some((old) => old.id === b.id)
  ).concat(changes);
  const issue = editor
    ? (!editor.days.length
      ? "Choose at least one day."
      : editor.value.activity.trim().length < 2
      ? "Describe the activity."
      : !editor.value.locationId
      ? "Choose a place."
      : edited.length > 28
      ? "Each week supports up to 28 blocks."
      : routineConflicts(edited).length
      ? "These times overlap another activity, or the end is before the start."
      : "")
    : "";
  const warnings = (blocks: CreatorRoutineBlock[]) => {
    const result: string[] = [];
    for (const b of blocks) {
      const place = locations.find((l) => l.id === b.locationId);
      const hours = place?.hours as
        | { open?: string; close?: string }
        | undefined;
      const parse = (v?: string) =>
        v && /^\d{1,2}:\d{2}$/.test(v)
          ? Number(v.split(":")[0]) * 60 + Number(v.split(":")[1])
          : null;
      const open = parse(hours?.open), close = parse(hours?.close);
      if (
        open !== null && close !== null && open < close &&
        (b.startMinute < open || b.endMinute > close) &&
        b.availability !== "busy"
      ) {
        result.push(
          (place?.name || "This place") +
            " may be closed during this activity.",
        );
      }
    }
    return [...new Set(result)];
  };
  return (
    <View style={s.form}>
      <View style={s.row}>
        <CreatorPicker
          label="Home area"
          value={life.homeLocationId}
          options={homes.map((l) => ({ value: l.id, label: l.name }))}
          onChange={(homeLocationId) => setLife({ homeLocationId })}
        />
        <CreatorPicker
          label="Workplace"
          value={life.workLocationId ?? ""}
          options={[
            { value: "", label: "Private / flexible" },
            ...workplaces.map((l) => ({ value: l.id, label: l.name })),
          ]}
          onChange={(workLocationId) =>
            setLife({ workLocationId: workLocationId || null })}
        />
      </View>
      <Text style={s.label}>What does a typical week look like?</Text>
      <TextInput
        accessibilityLabel="Typical week"
        value={life.lifestyle}
        onChangeText={(lifestyle) => setLife({ lifestyle })}
        maxLength={300}
        multiline
        style={[s.input, { minHeight: 84 }]}
        placeholder="Late shifts at the tavern, quiet mornings, and afternoons spent painting."
        placeholderTextColor={colors.muted}
      />
      <CreatorPicker
        label="Routine"
        value={preset}
        options={routinePresets}
        onChange={(scheduleStyle) => setLife({ scheduleStyle })}
      />
      {!routinePresets.some((p) => p.value === life.scheduleStyle) &&
          life.scheduleStyle !== life.lifestyle
        ? <Text style={s.help}>Current routine note: {life.scheduleStyle}</Text>
        : null}
      <Text style={s.label}>Favorite activities</Text>
      <Text style={s.help}>
        Choose a few interests to make room for in their week.
      </Text>
      <View style={s.row}>
        {life.preferredActivities.map((a) => (
          <Pressable
            key={a}
            accessibilityRole="button"
            accessibilityLabel={"Remove activity " + a}
            onPress={() =>
              setLife({
                preferredActivities: life.preferredActivities.filter((v) =>
                  v !== a
                ),
              })}
            style={s.chip}
          >
            <Text style={s.text}>{a} ×</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.row}>
        <TextInput
          accessibilityLabel="Add activity"
          value={activity}
          maxLength={80}
          onChangeText={setActivity}
          onSubmitEditing={() => addActivity(activity)}
          style={[s.input, { flex: 1 }]}
          placeholder="Add an activity"
          placeholderTextColor={colors.muted}
        />
        <Action
          label="Add"
          disabled={!activity.trim() || life.preferredActivities.length >= 10}
          onPress={() => addActivity(activity)}
        />
      </View>
      <View style={s.row}>
        {suggestions.map((a) => (
          <Pressable
            key={a}
            accessibilityRole="button"
            accessibilityLabel={"Add activity " + a}
            disabled={life.preferredActivities.length >= 10}
            onPress={() => addActivity(a)}
            style={s.suggestion}
          >
            <Text style={s.help}>+ {a}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.row}>
        <Text accessibilityRole="header" style={s.heading}>Weekly routine</Text>
        <Action label="Build my schedule" onPress={build} />
      </View>
      <Text style={s.help}>
        {weeks === 1
          ? "This week repeats. Add up to two more for variety."
          : "Week 1 → " +
            Array.from({ length: weeks - 1 }, (_, i) => "Week " + (i + 2)).join(
              " → ",
            ) +
            " → repeat. Week 1 begins in the week you create them."}
      </Text>
      <View style={s.row}>
        {Array.from(
          { length: weeks },
          (_, i) => (
            <Pressable
              key={i}
              accessibilityRole="tab"
              accessibilityState={{ selected: week === i }}
              aria-selected={week === i}
              onPress={() => setWeek(i)}
              style={[s.chip, week === i && s.selected]}
            >
              <Text style={s.text}>Week {i + 1}</Text>
            </Pressable>
          ),
        )}
        {weeks < 3 ? <Action label="+ Add week" onPress={addWeek} /> : null}
        {weeks > 1 ? <Action label="Remove week" onPress={removeWeek} /> : null}
      </View>
      {mismatch
        ? (
          <View style={s.notice}>
            <Text style={s.help}>
              Your routine details and schedule may differ. Preview an updated
              Week {week + 1}, or keep your edits.
            </Text>
            <Action label="Update schedule to match" onPress={build} />
          </View>
        )
        : null}
      {groups(current).map((blocks) => (
        <Pressable
          key={blocks[0]!.id}
          accessibilityRole="button"
          accessibilityLabel={"Edit " + dayLabel(blocks) + ": " +
            blocks[0]!.activity}
          onPress={() =>
            setEditor({
              blocks,
              value: { ...blocks[0]! },
              days: blocks.map((b) => b.dayOfWeek),
            })}
          style={s.scheduleRow}
        >
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={s.label}>
              {dayLabel(blocks)} ·{" "}
              {time(blocks[0]!.startMinute)}–{time(blocks[0]!.endMinute)}
            </Text>
            <Text style={s.text}>{blocks[0]!.activity}</Text>
            <Text style={s.help}>
              {locations.find((l) => l.id === blocks[0]!.locationId)?.name ||
                "Choose a place"} · {blocks[0]!.availability}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </Pressable>
      ))}
      {warnings(current).map((w) => <Text key={w} style={s.warning}>{w}</Text>)}
      <Action
        label="+ Add activity block"
        disabled={current.length >= 28}
        onPress={openNew}
      />
      <CreatorModal
        visible={Boolean(editor)}
        title={"Edit Week " + (week + 1)}
        onClose={() => setEditor(null)}
      >
        {editor
          ? (
            <View style={s.form}>
              <Text style={s.help}>
                Select days to repeat this activity. Change the days to copy it
                across the week.
              </Text>
              <View style={s.row}>
                {days.map((day, i) => (
                  <Pressable
                    key={day}
                    accessibilityRole="checkbox"
                    aria-checked={editor.days.includes(i)}
                    accessibilityState={{ checked: editor.days.includes(i) }}
                    onPress={() =>
                      setEditor({
                        ...editor,
                        days: editor.days.includes(i)
                          ? editor.days.filter((d) => d !== i)
                          : [...editor.days, i],
                      })}
                    style={[s.chip, editor.days.includes(i) && s.selected]}
                  >
                    <Text style={s.text}>{day}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                accessibilityLabel="Activity description"
                value={editor.value.activity}
                maxLength={160}
                onChangeText={(activity) =>
                  setEditor({
                    ...editor,
                    value: { ...editor.value, activity },
                  })}
                style={s.input}
              />
              <View style={s.row}>
                <CreatorPicker
                  label="Starts"
                  value={String(editor.value.startMinute)}
                  options={Array.from(
                    { length: 96 },
                    (_, i) => ({ value: String(i * 15), label: time(i * 15) }),
                  )}
                  onChange={(value) =>
                    setEditor({
                      ...editor,
                      value: { ...editor.value, startMinute: Number(value) },
                    })}
                />
                <CreatorPicker
                  label="Ends"
                  value={String(editor.value.endMinute)}
                  options={Array.from(
                    { length: 96 },
                    (_, i) => ({
                      value: String((i + 1) * 15),
                      label: time((i + 1) * 15),
                    }),
                  )}
                  onChange={(value) =>
                    setEditor({
                      ...editor,
                      value: { ...editor.value, endMinute: Number(value) },
                    })}
                />
              </View>
              <CreatorPicker
                label="Place"
                value={editor.value.locationId}
                options={locations.filter((l) =>
                  l.location_type !== "residence" ||
                  l.id === life.homeLocationId
                ).map((l) => ({ value: l.id, label: l.name }))}
                onChange={(locationId) =>
                  setEditor({
                    ...editor,
                    value: { ...editor.value, locationId },
                  })}
              />
              <CreatorPicker
                label="Availability"
                value={editor.value.availability}
                options={["available", "limited", "busy"].map((value) => ({
                  value,
                  label: value[0]!.toUpperCase() + value.slice(1),
                }))}
                onChange={(availability) =>
                  setEditor({
                    ...editor,
                    value: {
                      ...editor.value,
                      availability:
                        availability as CreatorRoutineBlock["availability"],
                    },
                  })}
              />
              {issue
                ? (
                  <Text accessibilityRole="alert" style={s.warning}>
                    {issue}
                  </Text>
                )
                : null}
              {warnings(changes).map((w) => (
                <Text key={w} style={s.warning}>{w}</Text>
              ))}
              <Action
                label="Save activity"
                disabled={Boolean(issue)}
                onPress={() => {
                  onRoutine([
                    ...routine.filter((b) => (b.weekIndex ?? 0) !== week),
                    ...edited.map((b) => ({
                      ...b,
                      id: routine.some((old) => old.id === b.id)
                        ? b.id
                        : createClientRequestId(),
                    })),
                  ]);
                  setEditor(null);
                }}
              />
              {editor.blocks.length
                ? (
                  <Action
                    label="Remove activity"
                    disabled={current.length === editor.blocks.length}
                    onPress={() => {
                      onRoutine(
                        routine.filter((b) =>
                          !editor.blocks.some((old) => old.id === b.id)
                        ),
                      );
                      setEditor(null);
                    }}
                  />
                )
                : null}
            </View>
          )
          : null}
      </CreatorModal>
      <CreatorModal
        visible={Boolean(preview)}
        title={"Preview Week " + (week + 1)}
        onClose={() => setPreview(null)}
      >
        <Text style={s.help}>
          Review these suggestions. Other weeks stay as they are.
        </Text>
        {groups(preview ?? []).map((blocks) => (
          <View key={blocks[0]!.id} style={s.scheduleRow}>
            <View>
              <Text style={s.label}>
                {dayLabel(blocks)} ·{" "}
                {time(blocks[0]!.startMinute)}–{time(blocks[0]!.endMinute)}
              </Text>
              <Text style={s.text}>{blocks[0]!.activity}</Text>
              <Text style={s.help}>
                {locations.find((l) =>
                  l.id === blocks[0]!.locationId
                )?.name}
              </Text>
            </View>
          </View>
        ))}
        {warnings(preview ?? []).map((w) => (
          <Text key={w} style={s.warning}>{w}</Text>
        ))}
        <Action
          label={"Use this Week " + (week + 1)}
          onPress={() => {
            if (preview) {
              onRoutine([
                ...routine.filter((b) => (b.weekIndex ?? 0) !== week),
                ...preview,
              ]);
              builtFrom.current[week] = signature;
              setRevision((v) => v + 1);
              setPreview(null);
            }
          }}
        />
      </CreatorModal>
    </View>
  );
}
function Action(
  { label, onPress, disabled = false }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  },
) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.action, disabled && { opacity: .4 }]}
    >
      <Text style={s.actionText}>{label}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  form: { gap: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  label: { color: colors.text, fontSize: 14, fontWeight: "700" },
  heading: { color: colors.text, fontSize: 19, fontWeight: "700", flex: 1 },
  text: { color: colors.text, fontSize: 14 },
  help: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    minHeight: 46,
    color: colors.text,
    fontSize: 14,
    backgroundColor: colors.background,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selected: {
    borderColor: colors.rose,
    backgroundColor: "rgba(196,92,220,.14)",
  },
  suggestion: { padding: 5 },
  action: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(176,95,221,.12)",
  },
  actionText: { color: colors.rose, fontSize: 13, fontWeight: "700" },
  scheduleRow: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  notice: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(176,95,221,.08)",
  },
  warning: { color: colors.warm, fontSize: 13, lineHeight: 19 },
});
