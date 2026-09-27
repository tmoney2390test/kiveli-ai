import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { styles } from "../../styles/opsStyles";
export function OperationsFilter(
  { label, value, options, onChange }: {
    label: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
  },
) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${
          options.find((item) => item.value === value)?.label
        }`}
        onPress={() => setOpen(true)}
        style={[styles.smallAction, {
          minHeight: 44,
          flexDirection: "row",
          gap: 9,
          alignItems: "center",
        }]}
      >
        <Text style={styles.smallActionText}>
          {options.find((item) => item.value === value)?.label ?? label}
        </Text>
        <ChevronDown color="#BBA4EF" size={14} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
            backgroundColor: "rgba(0,0,0,.65)",
          }}
        >
          <Pressable
            accessibilityLabel="Close filter"
            accessibilityRole="button"
            onPress={() => setOpen(false)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <View
            style={{
              width: "100%",
              maxWidth: 340,
              maxHeight: "80%",
              backgroundColor: "#111A27",
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: "#344155",
            }}
          >
            <Text style={styles.panelTitle}>{label}</Text>
            <ScrollView>
              {options.map((item) => (
                <Pressable
                  key={item.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: item.value === value }}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={{
                    minHeight: 48,
                    padding: 12,
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={[styles.recordTitle, { flex: 1 }]}>
                    {item.label}
                  </Text>
                  {item.value === value
                    ? <Check size={18} color="#C9B6FF" />
                    : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
