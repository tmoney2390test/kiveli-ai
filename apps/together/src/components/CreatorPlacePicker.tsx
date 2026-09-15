import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, ChevronDown, MapPin, Search, X } from "lucide-react-native";
import { CreatorModal } from "./CreatorPicker";
import { CatalogImage } from "./CatalogImage";
import { mappedLocationAsset } from "../location-assets";
import { colors } from "../theme";
import type { Location } from "../types";

const readable = (value: string) =>
  value.replace(/[_-]+/g, " ").replace(
    /\b\w/g,
    (letter) => letter.toUpperCase(),
  );
const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type Props = {
  label: string;
  value: string;
  locations: Location[];
  allLocations?: Location[];
  worldSlug?: string;
  allowFlexible?: boolean;
  onChange: (id: string) => void;
};
export function CreatorPlacePicker(
  {
    label,
    value,
    locations,
    allLocations = locations,
    worldSlug,
    allowFlexible = false,
    onChange,
  }: Props,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const selected = locations.find((place) => place.id === value);
  const categories = [
    ...new Set(locations.map((place) => place.category || place.location_type)),
  ].sort((a, b) => readable(a).localeCompare(readable(b)));
  const area = (place: Location) =>
    allLocations.find((parent) => parent.id === place.parent_location_id)?.name;
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const filtered = locations.filter((place) =>
    (!category || (place.category || place.location_type) === category) &&
    words.every((word) =>
      normalize(
        [
          place.name,
          place.description,
          readable(place.category || place.location_type),
          area(place),
          ...(place.possible_activities ?? []),
        ].filter(Boolean).join(" "),
      ).includes(word)
    )
  );
  const flexible = allowFlexible && !category &&
    words.every((word) =>
      normalize("Private flexible home workplace").includes(word)
    );
  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label + ": " +
          (selected?.name || (allowFlexible ? "Private / flexible" : "Choose"))}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => {
          setQuery("");
          setCategory("");
          setOpen(true);
        }}
        style={s.trigger}
      >
        <Text style={s.value}>
          {selected?.name || (allowFlexible ? "Private / flexible" : "Choose")}
        </Text>
        <ChevronDown size={18} color={colors.muted} />
      </Pressable>
      <CreatorModal
        visible={open}
        title={"Choose " + label.toLowerCase()}
        onClose={() => setOpen(false)}
      >
        <View style={s.search}>
          <Search size={18} color={colors.muted} />
          <TextInput
            accessibilityLabel="Search places"
            placeholder="Search places, activities, or areas"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            style={s.searchInput}
            autoCorrect={false}
          />
          {query
            ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear place search"
                onPress={() => setQuery("")}
                style={s.clear}
              >
                <X size={18} color={colors.muted} />
              </Pressable>
            )
            : null}
        </View>
        {categories.length > 1
          ? (
            <View style={{ gap: 8 }}>
              <Text style={s.label}>Place type</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.filters}
                keyboardShouldPersistTaps="handled"
              >
                {[
                  { id: "", name: "All places" },
                  ...categories.map((id) => ({ id, name: readable(id) })),
                ].map((filter) => (
                  <Pressable
                    key={filter.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: category === filter.id }}
                    aria-checked={category === filter.id}
                    onPress={() => setCategory(filter.id)}
                    style={[
                      s.filter,
                      category === filter.id && s.filterSelected,
                    ]}
                  >
                    <Text style={s.label}>{filter.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )
          : null}
        <Text accessibilityLiveRegion="polite" style={s.muted}>
          {filtered.length + (flexible ? 1 : 0)}{" "}
          {filtered.length + (flexible ? 1 : 0) === 1 ? "place" : "places"}
        </Text>
        <View style={{ gap: 10 }}>
          {flexible
            ? (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: !value }}
                aria-checked={!value}
                onPress={() => choose("")}
                style={[s.option, !value && s.selected]}
              >
                <View style={s.copy}>
                  <Text style={s.name}>Private / flexible</Text>
                  <Text style={s.muted}>
                    No fixed workplace. Set individual activities wherever they
                    belong.
                  </Text>
                </View>
                {!value ? <Check size={20} color={colors.rose} /> : null}
              </Pressable>
            )
            : null}
          {filtered.map((place) => {
            const image = mappedLocationAsset(worldSlug, place.slug);
            return (
              <Pressable
                key={place.id}
                accessibilityRole="radio"
                accessibilityLabel={place.name + ", " +
                  readable(place.category || place.location_type)}
                accessibilityState={{ checked: value === place.id }}
                aria-checked={value === place.id}
                onPress={() => choose(place.id)}
                style={[s.option, value === place.id && s.selected]}
              >
                {image
                  ? (
                    <CatalogImage
                      source={image}
                      style={s.thumbnail}
                      contentFit="cover"
                    />
                  )
                  : (
                    <View style={[s.thumbnail, s.fallback]}>
                      <MapPin size={24} color={colors.muted} />
                    </View>
                  )}
                <View style={s.copy}>
                  <Text style={s.name}>{place.name}</Text>
                  <Text style={s.category}>
                    {[
                      readable(place.category || place.location_type),
                      area(place),
                    ].filter(Boolean).join(" · ")}
                  </Text>
                  {place.description
                    ? (
                      <Text numberOfLines={2} style={s.muted}>
                        {place.description}
                      </Text>
                    )
                    : null}
                </View>
                {value === place.id
                  ? <Check size={20} color={colors.rose} />
                  : null}
              </Pressable>
            );
          })}
          {!filtered.length && !flexible
            ? (
              <View style={{ gap: 12 }}>
                <Text style={s.muted}>
                  No places match. Try a different activity or place type.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setQuery("");
                    setCategory("");
                  }}
                  style={s.filter}
                >
                  <Text style={s.label}>Clear filters</Text>
                </Pressable>
              </View>
            )
            : null}
        </View>
      </CreatorModal>
    </View>
  );
}
const s = StyleSheet.create({
  field: { flexGrow: 1, flexShrink: 1, minWidth: 120, gap: 8 },
  label: { color: colors.text, fontSize: 13, fontWeight: "700" },
  trigger: {
    minHeight: 56,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  value: { flex: 1, color: colors.text, fontSize: 15 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 12,
  },
  clear: {
    minWidth: 36,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  filters: { gap: 8, paddingBottom: 4 },
  filter: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
  },
  filterSelected: {
    borderColor: colors.rose,
    backgroundColor: "rgba(176,95,221,.12)",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selected: {
    borderColor: colors.rose,
    backgroundColor: "rgba(176,95,221,.08)",
  },
  thumbnail: { width: 72, height: 80, borderRadius: 10 },
  fallback: {
    backgroundColor: colors.elevated,
    justifyContent: "center",
    alignItems: "center",
  },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  name: { color: colors.text, fontSize: 16, fontWeight: "700" },
  category: { color: colors.rose, fontSize: 12 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
