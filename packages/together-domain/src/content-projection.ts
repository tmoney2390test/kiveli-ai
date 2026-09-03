export type ContentPolicyRow={content_rating?:unknown;visibility_scope?:unknown;[key:string]:unknown};
export function isSafelyVisible(row:ContentPolicyRow):boolean{return row.visibility_scope==='all'&&(row.content_rating==='safe'||row.content_rating==='suggestive');}
export function collapseRestrictedRuns<T extends ContentPolicyRow>(rows:T[],bridge:(run:T[])=>T,isVisible:(row:T)=>boolean=isSafelyVisible):T[]{
  const output:T[]=[];let restricted:T[]=[];
  const flush=()=>{if(restricted.length){output.push(bridge(restricted));restricted=[];}};
  for(const row of rows){if(isVisible(row)){flush();output.push(row);}else restricted.push(row);}
  flush();return output;
}
