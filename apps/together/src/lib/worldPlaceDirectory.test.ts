import {describe,expect,it}from'vitest';
import type{Location}from'../types';
import{buildWorldPlaceDirectory}from'./worldPlaceDirectory';

const locations:Location[]=[
  {id:'alder',world_id:'juniper',name:'Alder District',slug:'alder-district',location_type:'district',description:'Creative core',category:'district',possible_activities:['shopping'],sort_order:1},
  {id:'velvet',world_id:'juniper',parent_location_id:'alder',name:'Velvet Hour',slug:'velvet-hour',location_type:'venue',description:'Cocktail lounge',category:'lounge',possible_activities:['cocktails','music'],sort_order:2},
  {id:'paper',world_id:'juniper',parent_location_id:'alder',name:'Paper Trail',slug:'paper-trail',location_type:'venue',description:'Quiet bookstore',category:'bookstore',possible_activities:['books','coffee'],sort_order:3},
  {id:'piano-room',world_id:'juniper',parent_location_id:'velvet',name:'Piano Booths',slug:'piano-booths',location_type:'room',description:'Private booths',category:'room',possible_activities:['conversation']},
  {id:'riverwalk',world_id:'juniper',name:'Riverwalk',slug:'riverwalk',location_type:'outdoor',description:'Path beside the water',category:'outdoors',possible_activities:['walk'],sort_order:4},
  {id:'home',world_id:'juniper',name:'Private Loft',slug:'private-loft',location_type:'residence',description:'Home',category:'home',possible_activities:['rest'],metadata:{private:true}},
  {id:'tokyo',world_id:'tokyo',name:'Neon Arcade',slug:'neon-arcade',location_type:'venue',description:'Arcade',category:'entertainment',possible_activities:['games']},
];

describe('world place directory',()=>{
  it('groups canonical descendants beneath their district and keeps unassigned places visible',()=>{
    const directory=buildWorldPlaceDirectory(locations,'juniper');
    expect(directory.sections[0]?.district?.name).toBe('Alder District');
    expect(directory.sections[0]?.places.map((place)=>place.name)).toEqual(['Velvet Hour','Paper Trail']);
    expect(directory.sections.find((section)=>section.kind==='citywide')?.places.map((place)=>place.name)).toEqual(['Riverwalk']);
  });

  it('keeps rooms, private residences, and other worlds out of the photo directory',()=>{
    const directory=buildWorldPlaceDirectory(locations,'juniper');
    expect(directory.places.map((place)=>place.id)).toEqual(['velvet','paper','riverwalk']);
  });

  it('uses the same category semantics as Explore without losing district grouping',()=>{
    const directory=buildWorldPlaceDirectory(locations,'juniper',{category:'coffee'});
    expect(directory.sections).toHaveLength(1);
    expect(directory.sections[0]?.district?.id).toBe('alder');
    expect(directory.sections[0]?.places.map((place)=>place.id)).toEqual(['paper']);
  });

  it('expands a district-name search to every place in that district',()=>{
    const directory=buildWorldPlaceDirectory(locations,'juniper',{query:'alder'});
    expect(directory.sections[0]?.places.map((place)=>place.id)).toEqual(['velvet','paper']);
  });
});
