import { styles } from '../../../styles/chatStyles';
import { Pressable, Text, View } from 'react-native';
import {
  Brain,
  Check,
  ChevronRight,
  Heart,
  MessageCircle,
  Sparkles,
  Undo2,
} from 'lucide-react-native';
import { colors } from '../../../theme';
import type { CharacterInstance, RelationshipMilestone } from '../../../types';
import { type Feedback } from '../types';
export function ConversationHistoryFailure({ onRetry }: {
  onRetry: () => void;
}) {
  return (
    <View accessibilityLiveRegion='polite' style={styles.conversationLoadFailure}>
      <Text style={styles.conversationLoadFailureTitle}>Messages didn’t load</Text>
      <Text style={styles.conversationLoadFailureBody}>
        Your conversation is safe. Try loading its history again.
      </Text>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel='Retry loading conversation messages'
        onPress={onRetry}
        style={styles.conversationLoadRetry}
      >
        <Text style={styles.conversationLoadRetryText}>Try again</Text>
      </Pressable>
    </View>
  );
}
export function EmptyConversation({ character, prompts, onPrompt }: {
  character: CharacterInstance;
  prompts: string[];
  onPrompt: (value: string) => void;
}) {
  return (
    <View style={styles.empty}>
      <MessageCircle color={colors.rose} />
      <Text style={styles.emptyTitle}>The city is already in motion.</Text>
      <Text style={styles.emptyCopy}>
        Start with what is actually happening around {character.together_character_templates.name}.
      </Text>
      {prompts.map((prompt) => (
        <Pressable
          key={prompt}
          onPress={() => onPrompt(prompt)}
          style={styles.emptyPrompt}
        >
          <Text style={styles.suggestionText}>{prompt}</Text>
          <ChevronRight size={15} color={colors.rose} />
        </Pressable>
      ))}
    </View>
  );
}
export function RelationshipMomentCard({ milestone, busy, onChoose }: {
  milestone: RelationshipMilestone;
  busy: boolean;
  onChoose: (action: RelationshipMilestone['choices'][number]['id']) => void;
}) {
  return (
    <View style={[styles.milestoneCard, milestone.kind === 'repair' && styles.milestoneTense]}>
      <View style={styles.milestoneIcon}>
        <Heart
          size={18}
          color={milestone.kind === 'repair' ? colors.warm : colors.rose}
          fill={milestone.kind === 'repair' ? 'transparent' : 'rgba(216,62,234,.25)'}
        />
      </View>
      <Text style={styles.milestoneKicker}>
        {milestone.kind === 'repair' ? 'A MOMENT TO REPAIR' : 'YOUR STORY IS CHANGING'}
      </Text>
      <Text style={styles.milestoneTitle}>{milestone.title}</Text>
      <Text style={styles.milestoneBody}>{milestone.body}</Text>
      <Text style={styles.milestonePrompt}>{milestone.prompt}</Text>
      <View style={styles.milestoneChoices}>
        {milestone.choices.map((choice) => (
          <Pressable
            key={choice.id}
            disabled={busy}
            onPress={() => onChoose(choice.id)}
            style={[
              styles.milestoneChoice,
              choice.tone === 'primary' && styles.milestoneChoicePrimary,
              busy && styles.sendDisabled,
            ]}
          >
            <Text
              style={[
                styles.milestoneChoiceText,
                choice.tone === 'primary' && styles.milestoneChoicePrimaryText,
              ]}
            >
              {choice.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function StoryFeedback({ feedback, onView, onUndo, onDismiss }: {
  feedback: Feedback;
  onView: () => void;
  onUndo?: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.feedback}>
      <View style={styles.feedbackIcon}>
        {feedback.kind === 'memory'
          ? <Brain size={18} color={colors.rose} />
          : <Sparkles size={18} color={colors.warm} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.feedbackTitle}>{feedback.title}</Text>
        <Text style={styles.feedbackBody}>{feedback.body}</Text>
      </View>
      <Pressable onPress={onView} style={styles.feedbackAction}>
        <Text style={styles.feedbackActionText}>View</Text>
      </Pressable>
      {onUndo
        ? (
          <Pressable onPress={onUndo} style={styles.feedbackIcon}>
            <Undo2 size={16} color={colors.muted} />
          </Pressable>
        )
        : (
          <Pressable onPress={onDismiss} style={styles.feedbackIcon}>
            <Check size={16} color={colors.muted} />
          </Pressable>
        )}
    </View>
  );
}
