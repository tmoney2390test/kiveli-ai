import type { RelationshipMilestoneProposal } from '../../../packages/together-domain/src/index.ts';

export type PresentedRelationshipMilestone={title:string;body:string;prompt:string;choices:Array<{id:string;label:string;tone:'primary'|'secondary'}>};

export function presentRelationshipMilestone(proposal:RelationshipMilestoneProposal,input:{companionName:string;experienceTitle?:string}):PresentedRelationshipMilestone{
  const name=input.companionName;
  switch(proposal.presentationKey){
    case'relationship.repair':return{title:'Something feels unresolved',body:`${name} would rather address the tension honestly than pretend it is not there.`,prompt:'How do you want to handle it?',choices:[{id:'talk_it_out',label:'Talk it out',tone:'primary'},{id:'give_space',label:'Give them some space',tone:'secondary'}]};
    case'relationship.keep_in_touch':return{title:'Keep in touch?',body:`The moment is ending, but ${name} makes it clear they would like to keep talking.`,prompt:'What do you say?',choices:[{id:'accept',label:'I\u2019d like that',tone:'primary'},{id:'defer',label:'Let\u2019s take it slowly',tone:'secondary'}]};
    case'relationship.friendship_deepened':return{title:'This is becoming real',body:`Time with ${name} has started to feel less like chance meetings and more like an actual friendship.`,prompt:'How do you meet the moment?',choices:[{id:'accept',label:'I feel it too',tone:'primary'},{id:'defer',label:'Keep getting to know each other',tone:'secondary'}]};
    case'relationship.romantic_spark':return{title:'There\u2019s a spark here',body:`A warm moment with ${name} lingers, leaving room to decide whether this stays friendship or becomes something more.`,prompt:'Where do you want this to go?',choices:[{id:'accept',label:'Lean into the spark',tone:'primary'},{id:'stay_friends',label:'Keep this as friendship',tone:'secondary'},{id:'defer',label:'Not yet',tone:'secondary'}]};
    case'relationship.first_date_invitation':return{title:input.experienceTitle??'Spend time together?',body:`${name} is ready to turn the connection into a shared experience.`,prompt:'What do you say?',choices:[{id:'accept',label:'Yes\u2014let\u2019s do it',tone:'primary'},{id:'defer',label:'Ask me again later',tone:'secondary'}]};
    default:return{title:'Your relationship changed',body:`Something meaningful shifted between you and ${name}.`,prompt:'How do you respond?',choices:[{id:'accept',label:'Continue',tone:'primary'},{id:'defer',label:'Not yet',tone:'secondary'}]};
  }
}
