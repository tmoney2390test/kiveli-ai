import{assertEquals,assertRejects}from'jsr:@std/assert@1';
import{uploadGeneratedMediaWithRetry}from'./together-media-finalizer.ts';

Deno.test('generated media storage retries transient upload failures',async()=>{
  let attempts=0;
  const delays:number[]=[];
  const completedAt=await uploadGeneratedMediaWithRetry({
    upload:async()=>({error:++attempts<3?{message:'temporary storage failure'}:null}),
    wait:async(delay)=>{delays.push(delay);},
  });
  assertEquals(completedAt,3);
  assertEquals(attempts,3);
  assertEquals(delays,[300,600]);
});

Deno.test('generated media storage stops after the bounded retry budget',async()=>{
  let attempts=0;
  await assertRejects(
    ()=>uploadGeneratedMediaWithRetry({upload:async()=>{attempts+=1;return{error:{message:'storage unavailable'}};},wait:async()=>undefined}),
    Error,
    'The generated media could not be stored.',
  );
  assertEquals(attempts,3);
});
