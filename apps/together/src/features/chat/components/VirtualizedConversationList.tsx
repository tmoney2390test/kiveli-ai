import { useTimelineReveal } from '../../../hooks/useTimelineReveal';
import { Children, isValidElement, type ReactElement, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type FlatListProps,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from '../../../theme';
type VirtualizedConversationListProps =
  & Omit<FlatListProps<ReactElement>, 'data' | 'renderItem' | 'keyExtractor'>
  & {
    children: ReactNode;
    timelineKey: string;
    ready: boolean;
    listRef: RefObject<FlatList<ReactElement> | null>;
    latestScrollerRef: RefObject<((animated: boolean) => void) | null>;
  };
export function VirtualizedConversationList(
  { children, listRef, latestScrollerRef, timelineKey, ready, ...props }:
    VirtualizedConversationListProps,
) {
  const rows = Children.toArray(children).filter(isValidElement);
  const reveal = useTimelineReveal(timelineKey, ready);
  latestScrollerRef.current = (animated: boolean) => {
    listRef.current?.scrollToEnd({ animated });
  };
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        {...props}
        key={ready ? timelineKey : 'loading'}
        ref={listRef}
        style={[props.style, reveal.hidden && { opacity: 0 }]}
        accessibilityElementsHidden={reveal.hidden}
        importantForAccessibility={reveal.hidden ? 'no-hide-descendants' : 'auto'}
        onContentSizeChange={(width, height) => {
          props.onContentSizeChange?.(width, height);
          reveal.settled();
        }}
        onLayout={(event) => {
          props.onLayout?.(event);
          reveal.settled();
        }}
        data={rows}
        keyExtractor={(item, index) => String(item.key ?? `timeline-${index}`)}
        renderItem={({ item }) => item}
        initialNumToRender={Math.min(rows.length, 60)}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={24}
        windowSize={9}
        removeClippedSubviews={Platform.OS !== 'web'}
      />
      {reveal.hidden
        ? (
          <View
            pointerEvents='none'
            style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
          >
            <ActivityIndicator accessibilityLabel='Opening conversation' color={colors.rose} />
          </View>
        )
        : null}
    </View>
  );
}
