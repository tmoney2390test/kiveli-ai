import{describe,expect,it}from'vitest';
import{buildExploreContext,locationsForExploreCategory}from'./explore';
import type{Location,Snapshot}from'../types';

const locations=[
  {id:'coffee',world_id:'vesper',name:'Moss & Crumb',slug:'moss-and-crumb',location_type:'venue',description:'Bakery',category:'bakery',possible_activities:['coffee','pastry'],metadata:{tags:['quiet','food']}},
  {id:'bar',world_id:'vesper',name:'Velvet Hour',slug:'velvet-hour',location_type:'venue',description:'Lounge',category:'lounge',possible_activities:['cocktails','music'],metadata:{tags:['nightlife','romantic']}},
  {id:'arcade',world_id:'vesper',name:'Pixel & Pint',slug:'pixel-and-pint',location_type:'venue',description:'Arcade',category:'barcade',possible_activities:['arcade','games'],metadata:{tags:['games','social']}},
  {id:'home',world_id:'vesper',name:'Apartment',slug:'apartment',location_type:'residence',description:'Private',category:'home',possible_activities:['rest'],metadata:{private:true}},
  {id:'other',world_id:'solara',name:'Beach',slug:'beach',location_type:'outdoor',description:'Beach',category:'outdoors',possible_activities:['walk'],metadata:{}},
]as unknown as Location[];

describe('Explore world context',()=>{
  it('groups places into user-facing discovery categories',()=>{expect(locationsForExploreCategory(locations,'coffee').map((item)=>item.id)).toContain('coffee');expect(locationsForExploreCategory(locations,'nightlife').map((item)=>item.id)).toContain('bar');expect(locationsForExploreCategory(locations,'entertainment').map((item)=>item.id)).toContain('arcade');});
  it('keeps private homes and other worlds out of Explore',()=>{const snapshot={locations,lifeEvents:[],discoverableCharacters:[],characters:[],memories:[],sharedPlans:[],profile:null}as unknown as Snapshot;const result=buildExploreContext(snapshot,undefined,'vesper');expect(result.locations.map((item)=>item.id)).toEqual(expect.arrayContaining(['coffee','bar','arcade']));expect(result.locations.map((item)=>item.id)).not.toContain('home');expect(result.locations.map((item)=>item.id)).not.toContain('other');});
});
