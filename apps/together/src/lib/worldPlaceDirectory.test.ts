import {describe,expect,it}from'vitest';
import type{Location}from'../types';
import{buildWorldPlaceDirectory}from'./worldPlaceDirectory';

const locations:Location[]=[
  {id:'alder',world_id:'juniper',name:'Alder District',slug:'alder-district',location_type:'district',description:'Creative core',category:'district',possible_activities:['shopping'],sort_order:1},
  {id:'velvet',world_id:'juniper',parent_location_id:'alder',name:'Velvet Hour',slug:'velvet-hour',location_type:'venue',description:'Cocktail lounge',category:'lounge',hours:{open:'17:00',close:'01:00'},possible_activities:['cocktails','music'],sort_order:2},
  {id:'paper',world_id:'juniper',parent_location_id:'alder',name:'Paper Trail',slug:'paper-trail',location_type:'venue',description:'Quiet bookstore',category:'bookstore',hours:{open:'09:00',close:'21:00'},possible_activities:['books','coffee'],sort_order:3},
  {id:'hotel',world_id:'juniper',parent_location_id:'alder',name:'Juniper Inn',slug:'juniper-inn',location_type:'residence',description:'Neighborhood lodging',category:'hotel',hours:{open:'00:00',close:'23:59'},possible_activities:['stay'],sort_order:4},
  {id:'piano-room',world_id:'juniper',parent_location_id:'velvet',name:'Piano Booths',slug:'piano-booths',location_type:'room',description:'Private booths',category:'room',possible_activities:['conversation']},
  {id:'riverwalk',world_id:'juniper',name:'Riverwalk',slug:'riverwalk',location_type:'outdoor',description:'Path beside the water',category:'outdoors',possible_activities:['walk'],sort_order:5},
  {id:'home',world_id:'juniper',name:'Private Loft',slug:'private-loft',location_type:'residence',description:'Home',category:'home',possible_activities:['rest'],metadata:{private:true}},
  {id:'tokyo',world_id:'tokyo',name:'Neon Arcade',slug:'neon-arcade',location_type:'venue',description:'Arcade',category:'entertainment',possible_activities:['games']},
];

describe('world place directory',()=>{
  it('groups canonical descendants beneath their district and keeps unassigned places visible',()=>{
    const directory=buildWorldPlaceDirectory(locations,'juniper');
    expect(directory.sections[0]?.district?.name).toBe('Alder District');
    expect(directory.sections[0]?.places.map((place)=>place.name)).toEqual(['Velvet Hour','Paper Trail','Juniper Inn']);
    expect(directory.sections.find((section)=>section.kind==='citywide')?.places.map((place)=>place.name)).toEqual(['Riverwalk']);
  });

  it('keeps rooms, private residences, and other worlds out of the photo directory',()=>{
    const directory=buildWorldPlaceDirectory(locations,'juniper');
    expect(directory.places.map((place)=>place.id)).toEqual(['velvet','paper','hotel','riverwalk']);
  });

  it('uses the same category semantics as Explore without losing district grouping',()=>{
    const directory=buildWorldPlaceDirectory(locations,'juniper',{category:'food'});
    expect(directory.sections).toHaveLength(1);
    expect(directory.sections[0]?.district?.id).toBe('alder');
    expect(directory.sections[0]?.places.map((place)=>place.id)).toEqual(['paper']);
  });

  it('offers lodging as its own Explore and Places category',()=>{
    const directory=buildWorldPlaceDirectory(locations,'juniper',{category:'lodging'});
    expect(directory.sections[0]?.places.map((place)=>place.id)).toEqual(['hotel']);
    expect(directory.visiblePlaceCount).toBe(1);
  });

  it('expands a district-name search to every place in that district',()=>{
    const directory=buildWorldPlaceDirectory(locations,'juniper',{query:'alder'});
    expect(directory.sections[0]?.places.map((place)=>place.id)).toEqual(['velvet','paper','hotel']);
  });

  it('filters to places open now in the viewer timezone, including overnight hours',()=>{
    const evening=buildWorldPlaceDirectory(locations,'juniper',{openNow:true,now:new Date('2026-08-21T00:30:00Z'),timezone:'America/New_York'});
    expect(evening.places.map((place)=>place.id)).toEqual(['velvet','paper','hotel','riverwalk']);
    expect(evening.sections[0]?.places.map((place)=>place.id)).toEqual(['velvet','paper','hotel']);

    const overnight=buildWorldPlaceDirectory(locations,'juniper',{openNow:true,now:new Date('2026-08-21T04:30:00Z'),timezone:'America/New_York'});
    expect(overnight.sections[0]?.places.map((place)=>place.id)).toEqual(['velvet','hotel']);
    expect(overnight.visiblePlaceCount).toBe(2);
  });

  it('keeps a private home contextual beneath its building instead of presenting it as a destination peer',()=>{
    const riverside:Location[]=[
      {id:'riverside',world_id:'juniper',name:'Riverside',slug:'riverside',location_type:'district',description:'Waterfront',category:'district',possible_activities:[],sort_order:1},
      {id:'riverhouse',world_id:'juniper',parent_location_id:'riverside',name:'Riverhouse Apartments',slug:'riverhouse-apartments',location_type:'residence',description:'Apartments',category:'apartment',possible_activities:['visit resident'],sort_order:2},
      {id:'maya-home',world_id:'juniper',parent_location_id:'riverhouse',name:"Maya's Apartment",slug:'maya-apartment',location_type:'residence',description:'Private home',category:'home',possible_activities:['rest'],metadata:{private:true},sort_order:3},
    ];
    const directory=buildWorldPlaceDirectory(riverside,'juniper');
    expect(directory.sections[0]?.places.map((place)=>place.slug)).toEqual(['riverhouse-apartments']);
    expect(directory.places.some((place)=>place.slug==='maya-apartment')).toBe(false);
  });

  it('shows an explicitly public studio while hiding private life-engine support venues',()=>{
    const supportLocations:Location[]=[
      {id:'alder',world_id:'juniper',name:'Alder District',slug:'alder-district',location_type:'district',description:'Creative core',category:'district',possible_activities:[]},
      {id:'photo-studio',world_id:'juniper',parent_location_id:'alder',name:'Photography Studio',slug:'photography-studio',location_type:'venue',description:'Public creative studio',category:'work',possible_activities:['photography'],metadata:{directoryVisibility:'public'}},
      {id:'design-studio',world_id:'juniper',parent_location_id:'alder',name:'Design Studio',slug:'design-studio',location_type:'venue',description:'Schedule support venue',category:'work',possible_activities:['work'],metadata:{directoryVisibility:'private'}},
    ];
    const directory=buildWorldPlaceDirectory(supportLocations,'juniper');
    expect(directory.places.map((place)=>place.slug)).toEqual(['photography-studio']);
  });
});
