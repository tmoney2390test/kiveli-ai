import { Redirect } from 'expo-router';

/** Preserves legacy deep links while keeping the companion experience canonical. */
export default function MeetMaya() { return <Redirect href="/character/maya" />; }
