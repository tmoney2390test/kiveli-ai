import type { SupabaseClient } from '@supabase/supabase-js';
import { matchesChatPhotoSignature } from './chat-photo-policy.ts';
import { AppError } from './types.ts';

const MAX_AVATAR_BYTES=10*1024*1024;

export async function validatePrivateAvatarJpeg(db:SupabaseClient,path:string):Promise<void>{
  const{data,error}=await db.storage.from('together-user-media').download(path);
  if(error||!data)throw new AppError('VALIDATION_ERROR','That photo upload could not be found. Choose the photo again.',400);
  if(!data.size||data.size>MAX_AVATAR_BYTES){await db.storage.from('together-user-media').remove([path]);throw new AppError('VALIDATION_ERROR','Choose a photo no larger than 10 MB.',400);}
  const bytes=new Uint8Array(await data.arrayBuffer());
  if(!matchesChatPhotoSignature(bytes,'image/jpeg')){await db.storage.from('together-user-media').remove([path]);throw new AppError('VALIDATION_ERROR','That photo could not be opened safely. Choose another JPEG, PNG, or WebP photo.',400);}
}
