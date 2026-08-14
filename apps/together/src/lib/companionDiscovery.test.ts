import{describe,expect,it}from'vitest';
import{rankCompanions}from'./companionDiscovery';
describe('companion discovery',()=>{it('ranks shared goals before incidental interests',()=>{const ranked=rankCompanions(['Social worlds'],['Books']);expect(ranked[0]?.goals).toContain('Social worlds');});it('does not mutate the catalog',()=>{const input=[{id:'1',name:'A',slug:'a',occupation:'',summary:'',traits:[],interests:[],goals:[]},{id:'2',name:'B',slug:'b',occupation:'',summary:'',traits:[],interests:['Music'],goals:[]}];rankCompanions([],['Music'],input);expect(input[0]?.id).toBe('1');});});
