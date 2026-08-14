import{Redirect}from'expo-router';import{LoadingSkeleton}from'../src/components';import{activeCompanion}from'../src/lib/companionLife';import{useTogether}from'../src/store/useTogether';
/** Preserves the original deep link while resolving to the user's chosen companion. */
export default function MeetCompanion(){const snapshot=useTogether((state)=>state.snapshot);if(!snapshot)return <LoadingSkeleton/>;const companion=activeCompanion(snapshot);return <Redirect href={(companion?`/character/${companion.together_character_templates.slug}?intro=1`:'/(tabs)/singles')as never}/>}
