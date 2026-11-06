import { useEffect, useState } from "react";
import { Image } from "expo-image";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "../../lib/api/transport";
import { colors } from "../../theme";
import { useAuth } from "../../hooks/useAuth";
type Artwork = {
  id: string;
  status: string;
  url?: string;
  created_at: string;
  error_code?: string;
  cost_usd?: number;
};
type HomeRow = {
  id: string;
  name: string;
  description: string;
  prompt_text: string;
  personal_details: Array<{ id: string; description: string }>;
  possible_activities: string[];
  approved_artwork_id?: string;
  invitation_config?: { enabled?: boolean };
  together_worlds?: { name: string };
  artwork: Artwork[];
};
export function CharacterHomesPanel() {
  const { session } = useAuth();
  const [worldSlug,setWorldSlug] = useState("eos-meridian");
  const query = useQuery({
    queryKey: ["ops-homes", session?.user.id,worldSlug],
    enabled: Boolean(session?.user.id),
    queryFn: () =>
      invoke<{ homes: HomeRow[];worlds?: Array<{name:string;slug:string}> }>("together-home-ops", { action: "list",worldSlug }),
    refetchInterval: (current) =>
      current.state.data?.homes.some((h) =>
          h.artwork.some((a) => a.status === "generating")
        )
        ? 5000
        : false,
  });
  const [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const home = query.data?.homes.find((h) => h.id === selected);
  async function mutate(input: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result=await invoke<{started?:boolean}>("together-home-ops", input);
      await query.refetch();
      setNotice(
        input.action === "approve"
          ? "Home image saved."
          : input.action === "edit"
          ? "Home details saved."
          : result.started===false ? "No images are queued for this world." : "Artwork job started. The current image stays in place until you approve a replacement.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "That change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Character homes</Text>
      <Text style={styles.copy}>
        Choose a world to review its homes, artwork, and invitations.
      </Text>
      <View style={styles.row}>
        {query.data?.worlds?.map(world=>(
          <Pressable key={world.slug} accessibilityRole="button" accessibilityState={{selected:world.slug===worldSlug,disabled:busy}} disabled={busy}
            onPress={()=>{setWorldSlug(world.slug);setSelected(null);setNotice("");setError("");}}
            style={[styles.chip,world.slug===worldSlug&&styles.selected]}>
            <Text style={styles.copy}>{world.name}</Text>
          </Pressable>
        ))}
      </View>
      {error || query.error
        ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error || (query.error as Error).message}
          </Text>
        )
        : null}
      {notice
        ? (
          <Text accessibilityLiveRegion="polite" style={styles.copy}>
            {notice}
          </Text>
        )
        : null}
      <View style={styles.row}>
        <Action
          label="Refresh"
          disabled={busy}
          onPress={() => void query.refetch()}
        />
        <Action
          label="Generate next queued image"
          disabled={busy || Boolean(
            query.data?.homes.some((h) =>
              h.artwork.some((a) => a.status === "generating")
            ),
          )}
          onPress={() => void mutate({ action: "process_next",worldSlug })}
        />
      </View>
      <View style={styles.row}>
        {query.data?.homes.map((item) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: item.id === selected }}
            key={item.id}
            onPress={() => setSelected(item.id)}
            style={[styles.chip, item.id === selected && styles.selected]}
          >
            <Text style={styles.copy}>{item.name}</Text>
            <Text style={styles.small}>
              {item.approved_artwork_id
                ? "Image approved"
                : item.artwork.some((a) => a.status === "ready")
                ? "Ready to review"
                : item.artwork.find((a) => a.status === "generating")
                ? "Generating"
                : item.artwork.some((a) => a.status === "failed")
                ? "Needs attention"
                : "Queued"}
            </Text>
          </Pressable>
        ))}
      </View>
      {home
        ? (
          <>
            <HomeEditor
              key={home.id}
              home={home}
              busy={busy}
              onSave={(patch) =>
                void mutate({ action: "edit", homeId: home.id, ...patch })}
            />
            <Text style={styles.title}>Artwork history</Text>
            <Action
              label="Generate a new version"
              disabled={busy ||
                home.artwork.some((a) => a.status === "generating")}
              onPress={() =>
                void mutate({ action: "generate", homeId: home.id })}
            />
            {home.artwork.slice().sort((a, b) =>
              b.created_at.localeCompare(a.created_at)
            ).map((art) => (
              <View key={art.id} style={styles.art}>
                {art.url
                  ? (
                    <Image
                      source={{ uri: art.url }}
                      style={styles.image}
                      contentFit="contain"
                    />
                  )
                  : null}
                <Text style={styles.copy}>
                  {art.status}
                  {art.id === home.approved_artwork_id
                    ? " · Current home image"
                    : ""}
                </Text>
                {art.error_code
                  ? <Text style={styles.error}>{art.error_code}</Text>
                  : null}
                {art.status === "ready" && art.id !== home.approved_artwork_id
                  ? (
                    <Action
                      label="Use this image"
                      disabled={busy}
                      onPress={() =>
                        void mutate({
                          action: "approve",
                          homeId: home.id,
                          artworkId: art.id,
                        })}
                    />
                  )
                  : null}
              </View>
            ))}
          </>
        )
        : query.isPending
        ? <Text style={styles.copy}>Loading homes…</Text>
        : (
          <Text style={styles.copy}>
            Choose a home to review its details and artwork.
          </Text>
        )}
    </View>
  );
}
function HomeEditor(
  { home, busy, onSave }: {
    home: HomeRow;
    busy: boolean;
    onSave: (data: Record<string, unknown>) => void;
  },
) {
  const [name, setName] = useState(home.name),
    [description, setDescription] = useState(home.description),
    [prompt, setPrompt] = useState(home.prompt_text),
    [details, setDetails] = useState(
      home.personal_details.map((x) => x.description),
    ),
    [activities, setActivities] = useState(home.possible_activities.join("\n")),
    [enabled, setEnabled] = useState(home.invitation_config?.enabled !== false);
  useEffect(() => {
    setName(home.name);
    setDescription(home.description);
    setPrompt(home.prompt_text);
    setDetails(home.personal_details.map((x) => x.description));
    setActivities(home.possible_activities.join("\n"));
    setEnabled(home.invitation_config?.enabled !== false);
  }, [
    home.id,
    home.name,
    home.description,
    home.prompt_text,
    JSON.stringify(home.personal_details),
    home.possible_activities.join("\n"),
    home.invitation_config?.enabled,
  ]);
  const fields = [
    ["Name", name, setName],
    ["Description", description, setDescription],
    ["Image direction", prompt, setPrompt],
    ["Activities (one per line)", activities, setActivities],
  ] as const;
  return (
    <View style={styles.editor}>
      {fields.map(([label, value, onChange]) => (
        <View key={label}>
          <Text style={styles.small}>{label}</Text>
          <TextInput
            accessibilityLabel={label}
            value={value}
            onChangeText={onChange}
            multiline={label !== "Name"}
            style={styles.input}
          />
        </View>
      ))}
      {details.map((text, index) => (
        <View key={index}>
          <Text style={styles.small}>Personal detail {index + 1}</Text>
          <TextInput
            accessibilityLabel={`Personal detail ${index + 1}`}
            value={text}
            multiline
            onChangeText={(value) =>
              setDetails((rows) =>
                rows.map((item, i) => i === index ? value : item)
              )}
            style={styles.input}
          />
        </View>
      ))}
      <View style={styles.row}>
        <Text style={styles.copy}>
          Occasional invitations during active chats
        </Text>
        <Switch
          accessibilityLabel="Allow home invitations"
          value={enabled}
          onValueChange={setEnabled}
        />
      </View>
      <Action
        label="Save home details"
        disabled={busy}
        onPress={() =>
          onSave({
            name,
            description,
            prompt,
            details: details.map((description, index) => ({
              id: `detail-${index + 1}`,
              description,
            })),
            activities: activities.split("\n").map((s) => s.trim()).filter(
              Boolean,
            ),
            invitationsEnabled: enabled,
          })}
      />
    </View>
  );
}
function Action(
  { label, disabled, onPress }: {
    label: string;
    disabled?: boolean;
    onPress: () => void;
  },
) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: .45 }]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  panel: { padding: 20, gap: 16 },
  title: { color: colors.text, fontSize: 22, fontWeight: "600" },
  copy: { color: colors.text, fontSize: 14, lineHeight: 21 },
  small: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  error: { color: "#F38C9B" },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  button: {
    padding: 13,
    borderRadius: 14,
    backgroundColor: "rgba(161,87,193,.22)",
    alignSelf: "flex-start",
  },
  buttonText: { color: colors.rose, fontWeight: "600" },
  chip: {
    borderWidth: 1,
    borderColor: "rgba(190,140,210,.15)",
    padding: 12,
    borderRadius: 14,
    minWidth: 180,
  },
  selected: { borderColor: colors.rose },
  editor: {
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(148,86,163,.06)",
  },
  input: {
    color: colors.text,
    borderWidth: 1,
    borderColor: "rgba(190,140,210,.25)",
    padding: 12,
    borderRadius: 12,
    minHeight: 45,
    marginTop: 5,
  },
  art: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(190,140,210,.18)",
    borderRadius: 16,
  },
  image: { width: "100%", aspectRatio: 1.5, maxHeight: 500 },
});
