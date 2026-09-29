import { assert, assertRejects } from 'jsr:@std/assert@1';
import { createPersonalPlaceInput, validatePersonalPlaceImage } from './personal-place-input.ts';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', place='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const path=`${user}/places/${place}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg`;
const valid={action:'create',locationId:place,worldId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',kind:'home',name:'My home',description:'A warm room with a garden view.',activities:['Talking'],image:{path,width:1024,height:768}};
Deno.test('creation requires an image and validates the hours payload',()=>{
  assert(createPersonalPlaceInput.safeParse(valid).success);
  assert(!createPersonalPlaceInput.safeParse({...valid,image:undefined}).success);
  assert(!createPersonalPlaceInput.safeParse({...valid,hours:{open:'noon',close:'18:00'}}).success);
});
Deno.test('another user, another place, and path traversal cannot supply the image',async()=>{
  const db={storage:{from:()=>{throw new Error('must not reach storage');}}};
  for(const candidate of [path.replace(user,place),path.replace(`/places/${place}/`,`/places/${user}/`),`${user}/places/${place}/../file.jpg`]){
    await assertRejects(()=>validatePersonalPlaceImage(db,user,place,candidate),Error,'does not belong');
  }
});
Deno.test('image must exist and contain JPEG bytes before a place is created',async()=>{
  const storage=(file:Blob|null)=>({storage:{from:()=>({download:async()=>({data:file,error:null})})}});
  await assertRejects(()=>validatePersonalPlaceImage(storage(null),user,place,path),Error,'Upload the image');
  await assertRejects(()=>validatePersonalPlaceImage(storage(new Blob([new Uint8Array(1200)])),user,place,path),Error,'not a JPEG');
  const bytes=new Uint8Array(1200);bytes.set([255,216,255]);
  assert((await validatePersonalPlaceImage(storage(new Blob([bytes])),user,place,path)).size===1200);
});
