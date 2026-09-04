import {VENICE_IMAGE_API_BASE} from '../../../packages/together-domain/src/venice-media.ts';
import {AppError} from './types.ts';

export type VideoPromptEnhancementInput={
  prompt:string;
  characterName:string;
  locationName?:string|null;
  activity?:string|null;
  routeName:string;
  duration:number;
  resolution:string;
  sound:boolean;
  aspectRatio:'9:16'|'16:9';
  contentLevel:string;
};

type EnhancerOptions={apiKey:string;baseUrl?:string;model?:string;fetcher?:typeof fetch;timeoutMs?:number};

export class ConfiguredVideoPromptEnhancer{
  private readonly apiKey:string;
  private readonly baseUrl:string;
  private readonly model:string;
  private readonly fetcher:typeof fetch;
  private readonly timeoutMs:number;
  constructor(options:EnhancerOptions){this.apiKey=options.apiKey;this.baseUrl=options.baseUrl??VENICE_IMAGE_API_BASE;this.model=options.model??'mistral-31-24b';this.fetcher=options.fetcher??fetch;this.timeoutMs=options.timeoutMs??8_000;}
  async enhance(input:VideoPromptEnhancementInput):Promise<{prompt:string;model:string;version:string;latencyMs:number}>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),this.timeoutMs),started=performance.now();
    try{
      const response=await this.fetcher(`${this.baseUrl}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${this.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:this.model,messages:[{role:'system',content:videoEnhancementInstructions(input)},{role:'user',content:JSON.stringify({direction:input.prompt,character:input.characterName,location:input.locationName??null,currentActivity:input.activity??null,video:{model:input.routeName,durationSeconds:input.duration,resolution:input.resolution,sound:input.sound,aspectRatio:input.aspectRatio,contentLevel:input.contentLevel}})}],max_completion_tokens:220,temperature:.25,stream:false,venice_parameters:{disable_thinking:true,strip_thinking_response:true,enable_web_search:'off',include_venice_system_prompt:false}}),signal:controller.signal});
      if(!response.ok){await response.arrayBuffer().catch(()=>new ArrayBuffer(0));throw new AppError('PROVIDER_UNAVAILABLE','Prompt enhancement is temporarily unavailable.',503,true);}
      const payload=await response.json() as Record<string,unknown>,prompt=normalizeEnhancedVideoPrompt(responseText(payload));
      if(!prompt)throw new AppError('PROVIDER_SUBMISSION_UNKNOWN','The prompt could not be enhanced safely. Your original is unchanged.',503,true);
      return{prompt,model:typeof payload.model==='string'?payload.model:this.model,version:'video-prompt-v1',latencyMs:Math.max(0,Math.round(performance.now()-started))};
    }catch(error){
      if(error instanceof AppError)throw error;
      if(error instanceof DOMException&&error.name==='AbortError')throw new AppError('PROVIDER_TIMEOUT','Prompt enhancement took too long. Your original is unchanged.',503,true);
      throw new AppError('PROVIDER_UNAVAILABLE','Prompt enhancement is temporarily unavailable. Your original is unchanged.',503,true);
    }finally{clearTimeout(timeout);}
  }
}

export function configuredVideoPromptEnhancer():ConfiguredVideoPromptEnhancer|null{
  if(Deno.env.get('VIDEO_PROMPT_ENHANCEMENT_ENABLED')?.trim().toLowerCase()==='false')return null;
  const apiKey=Deno.env.get('VENICE_API_KEY')?.trim();if(!apiKey)return null;
  return new ConfiguredVideoPromptEnhancer({apiKey,baseUrl:Deno.env.get('KIVELLE_VENICE_API_BASE')??VENICE_IMAGE_API_BASE,model:Deno.env.get('KIVELLE_VIDEO_PROMPT_ENHANCEMENT_MODEL')??'mistral-31-24b'});
}

export function videoEnhancementInstructions(input:Pick<VideoPromptEnhancementInput,'contentLevel'|'sound'>):string{
  const adult=['suggestive','mature','explicit'].includes(input.contentLevel);
  return[
    'Rewrite an already-approved user direction into one concise, concrete image-to-video prompt of at most 400 characters.',
    'Return only the rewritten prompt, with no label, quotation marks, markdown, refusal, warning, or explanation.',
    'Preserve the exact requested action and intensity. Do not invent people, actions, nudity, clothing changes, locations, dialogue, or story events.',
    adult?'The scene involves fictional consenting adults. Preserve the approved adult direction without euphemizing it or adding details the user did not request.':'Keep the result non-explicit and do not expose body areas covered in the source.',
    'Describe motion over time, expression, restrained camera behavior, and small environmental movement. Prefer one continuous physically coherent shot.',
    'Keep identity, face, body count, anatomy, clothing state, setting, and time of day stable. Avoid duplicated or growing limbs and abrupt morphing.',
    input.sound?'Include a brief natural audio cue only when it follows directly from the request.':'Do not mention dialogue, music, or audio.',
    'Never introduce minors, ambiguous ages, non-consent, incest, exploitation, sexual violence, bestiality, trafficking, or a real-person likeness.',
  ].join(' ');
}

export function normalizeEnhancedVideoPrompt(value:string):string|null{
  const normalized=value.replace(/^\s*(?:enhanced\s+prompt|prompt)\s*:\s*/i,'').trim().replace(/^['"`]+/,'').replace(/['"`]+$/,'').replace(/\s+/g,' ').trim();
  return normalized.length>=2&&normalized.length<=400?normalized:null;
}

function responseText(payload:Record<string,unknown>):string{
  const choices=Array.isArray(payload.choices)?payload.choices:[],choice=choices[0]&&typeof choices[0]==='object'?choices[0] as Record<string,unknown>:null,message=choice?.message&&typeof choice.message==='object'?choice.message as Record<string,unknown>:null,content=message?.content;
  if(typeof content==='string')return content;
  return Array.isArray(content)?content.map((part)=>part&&typeof part==='object'&&typeof (part as Record<string,unknown>).text==='string'?String((part as Record<string,unknown>).text):'').join(' '):'';
}
