import { useAuth } from '../src/hooks/useAuth';
import { SupportScreen } from '../src/features/support/SupportScreen';
export default function Support(){
  const {session}=useAuth();
  return <SupportScreen key={session?.user.id??'signed-out'} userId={session?.user.id}/>;
}
