import { OpenAiVisionProvider } from './openai-vision.ts';
import { AppError } from './types.ts';

Deno.test('OpenAI vision moderates before analysis and returns only bounded safe context',async()=>{
  const calls:Array<{url:string;body:Record<string,any>;authorization:string}>=[];
  const provider=new OpenAiVisionProvider('server-secret','vision-test','https://openai.test/v1',1_000,async(input,init)=>{
    const body=JSON.parse(String(init?.body)) as Record<string,any>;
    calls.push({url:String(input),body,authorization:new Headers(init?.headers).get('authorization')??''});
    if(String(input).endsWith('/moderations'))return new Response(JSON.stringify({results:[{flagged:false,categories:{sexual:false,'violence/graphic':false}}]}),{status:200});
    return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({shortDescription:'A dog beside a red backpack.',notableDetails:['small brown dog','red backpack'],visibleText:'TRAIL',safetyCategories:[],confidence:.93,containsRealPerson:false,containsMinor:false})}]}]}),{status:200,headers:{'x-request-id':'vision-1'}});
  });
  const result=await provider.analyze({bytes:new Uint8Array([0xff,0xd8,0xff,0xd9]),contentType:'image/jpeg',userCaption:'First hike!',safetyIdentifier:'opaque-user'});
  assert(calls.length===2&&calls[0]?.url.endsWith('/moderations')&&calls[1]?.url.endsWith('/responses'));
  assert(calls.every((call)=>call.authorization==='Bearer server-secret'));
  const moderationImage=calls[0]?.body.input?.find((item:Record<string,unknown>)=>item.type==='image_url');
  assert(typeof moderationImage?.image_url==='object'&&String((moderationImage.image_url as Record<string,unknown>).url).startsWith('data:image/jpeg;base64,'));
  assert(calls[1]?.body.store===false&&calls[1]?.body.safety_identifier==='opaque-user');
  assert(JSON.stringify(calls[1]?.body).includes('First hike!')&&JSON.stringify(calls[1]?.body).includes('input_image'));
  assert(result.shortDescription==='A dog beside a red backpack.'&&result.notableDetails.length===2&&result.providerRequestId==='vision-1');
  assert(result.contentRating==='safe');
  assert(!JSON.stringify(result).includes('server-secret'));
});

Deno.test('OpenAI vision rejects moderated content before understanding',async()=>{
  let calls=0;
  const provider=new OpenAiVisionProvider('secret','vision-test','https://openai.test/v1',1_000,async()=>{calls+=1;return new Response(JSON.stringify({results:[{flagged:true,categories:{sexual:true}}]}),{status:200});});
  let error:unknown;
  try{await provider.analyze({bytes:new Uint8Array([1,2,3]),contentType:'image/jpeg'});}catch(caught){error=caught;}
  assert(error instanceof AppError&&error.code==='PROVIDER_CONTENT_BLOCKED'&&calls===1);
});

Deno.test('OpenAI vision allows sexual-only moderation for an authorized adult web upload',async()=>{
  let calls=0;
  const provider=new OpenAiVisionProvider('secret','vision-test','https://openai.test/v1',1_000,async(input)=>{
    calls+=1;
    if(String(input).endsWith('/moderations'))return new Response(JSON.stringify({results:[{flagged:true,categories:{sexual:true,'sexual/minors':false,'violence/graphic':false}}]}),{status:200});
    return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({shortDescription:'Two clearly adult people in an intimate pose.',notableDetails:['adult nudity'],safetyCategories:['adult nudity'],confidence:.9,containsRealPerson:true,containsMinor:false})}]}]}),{status:200});
  });
  const result=await provider.analyze({bytes:new Uint8Array([1,2,3]),contentType:'image/jpeg',allowExplicitAdult:true});
  assert(calls===2&&result.contentRating==='explicit'&&result.safetyCategories.includes('sexual'));
});

Deno.test('OpenAI vision keeps prohibited categories blocked for an authorized adult web upload',async()=>{
  for(const categories of [{sexual:true,'sexual/minors':true},{sexual:true,'violence/graphic':true}]){
    const provider=new OpenAiVisionProvider('secret','vision-test','https://openai.test/v1',1_000,async()=>new Response(JSON.stringify({results:[{flagged:true,categories}]}),{status:200}));
    let error:unknown;
    try{await provider.analyze({bytes:new Uint8Array([1,2,3]),contentType:'image/jpeg',allowExplicitAdult:true});}catch(caught){error=caught;}
    assert(error instanceof AppError&&error.code==='PROVIDER_CONTENT_BLOCKED');
  }
});

Deno.test('OpenAI vision fails closed on ambiguous participant age in an adult upload',async()=>{
  const provider=new OpenAiVisionProvider('secret','vision-test','https://openai.test/v1',1_000,async(input)=>String(input).endsWith('/moderations')
    ?new Response(JSON.stringify({results:[{flagged:true,categories:{sexual:true}}]}),{status:200})
    :new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({shortDescription:'An intimate scene.',notableDetails:[],safetyCategories:[],confidence:.6,containsRealPerson:true,containsMinor:true})}]}]}),{status:200}));
  let error:unknown;
  try{await provider.analyze({bytes:new Uint8Array([1,2,3]),contentType:'image/jpeg',allowExplicitAdult:true});}catch(caught){error=caught;}
  assert(error instanceof AppError&&error.code==='PROVIDER_CONTENT_BLOCKED');
});

Deno.test('adult vision instructions do not treat ordinary uncertainty between adult ages as a minor signal',async()=>{
  let instruction='';
  const provider=new OpenAiVisionProvider('secret','vision-test','https://openai.test/v1',1_000,async(input,init)=>{
    if(String(input).endsWith('/moderations'))return new Response(JSON.stringify({results:[{flagged:true,categories:{sexual:true}}]}),{status:200});
    const body=JSON.parse(String(init?.body)) as Record<string,any>;
    instruction=String(body.input?.[0]?.content?.find((item:Record<string,unknown>)=>item.type==='input_text')?.text??'');
    return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({shortDescription:'An adult in an intimate portrait.',notableDetails:[],safetyCategories:[],confidence:.9,containsRealPerson:true,containsMinor:false})}]}]}),{status:200});
  });
  const result=await provider.analyze({bytes:new Uint8Array([1,2,3]),contentType:'image/jpeg',allowExplicitAdult:true});
  assert(result.contentRating==='explicit');
  assert(instruction.includes("ordinary uncertainty between adult ages is not evidence of a minor"));
});

function assert(value:unknown):asserts value{if(!value)throw new Error('assertion_failed');}
