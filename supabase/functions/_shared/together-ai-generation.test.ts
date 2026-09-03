import { assertEquals } from 'jsr:@std/assert';
import { executeResponsesWithTemperatureFallback } from './together-ai.ts';

Deno.test('temperature compatibility retry removes only temperature and runs once',async()=>{
  const bodies:Record<string,unknown>[]=[];
  const fetchImpl=(async(_input:RequestInfo|URL,init?:RequestInit)=>{
    bodies.push(JSON.parse(String(init?.body)));
    return bodies.length===1
      ?new Response(JSON.stringify({error:{message:'temperature is not supported with this model'}}),{status:400})
      :new Response(JSON.stringify({output_text:'hello'}),{status:200});
  }) as typeof fetch;
  const options={route:{provider:'openai'},unsupportedTemperatureFallback:false} as never;
  const response=await executeResponsesWithTemperatureFallback(fetchImpl,'openai','secret',{model:'test',temperature:.85,reasoning:{effort:'low'}},options);
  assertEquals(response.status,200);
  assertEquals(bodies.length,2);
  assertEquals(bodies[0]?.temperature,.85);
  assertEquals('temperature' in (bodies[1]??{}),false);
  assertEquals((options as {unsupportedTemperatureFallback:boolean}).unsupportedTemperatureFallback,true);
});

Deno.test('other provider validation failures are not retried',async()=>{
  let calls=0;
  const fetchImpl=(async()=>{calls+=1;return new Response(JSON.stringify({error:{message:'invalid request'}}),{status:400});}) as typeof fetch;
  const response=await executeResponsesWithTemperatureFallback(fetchImpl,'xai','secret',{temperature:1},{} as never);
  assertEquals(response.status,400);
  assertEquals(calls,1);
});
