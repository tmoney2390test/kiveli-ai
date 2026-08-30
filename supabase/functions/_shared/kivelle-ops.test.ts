import{assertEquals,assertThrows}from'jsr:@std/assert@1';
import{compareOperationalAlert,operationsRoleForUser,requireOperationsRole,sanitizeOperationsText,sumPhotoCleanupFailures}from'./kivelle-ops.ts';

Deno.test('operations roles preserve least privilege',()=>{
  assertEquals(operationsRoleForUser({id:'viewer',app_metadata:{together_ops_role:'viewer'}} as never),'viewer');
  assertEquals(operationsRoleForUser({id:'support',app_metadata:{together_ops_role:'support'}} as never),'support');
  assertEquals(operationsRoleForUser({id:'admin',app_metadata:{together_admin:true}} as never),'admin');
  assertEquals(operationsRoleForUser({id:'none',app_metadata:{}} as never),null);
  assertThrows(()=>requireOperationsRole({id:'viewer',app_metadata:{together_ops_role:'viewer'}} as never,'support'));
});

Deno.test('operational alert comparisons honor configured operators',()=>{
  assertEquals(compareOperationalAlert(10,'gte',10),true);
  assertEquals(compareOperationalAlert(10,'gt',10),false);
  assertEquals(compareOperationalAlert(5,'lte',5),true);
  assertEquals(compareOperationalAlert(5,'lt',5),false);
  assertEquals(compareOperationalAlert(3,'eq',3),true);
});

Deno.test('operations sanitizer removes credentials and email addresses',()=>{
  const safe=sanitizeOperationsText('Bearer abc.def_123 sent by person@example.com using sk-secretvalue',500);
  assertEquals(safe.includes('person@example.com'),false);
  assertEquals(safe.includes('sk-secretvalue'),false);
  assertEquals(safe.includes('abc.def_123'),false);
});

Deno.test('photo cleanup health sums only aggregate failure counts',()=>{
  assertEquals(sumPhotoCleanupFailures([{properties:{failures:2,expired:4}},{properties:{failures:1}},{properties:{failures:'invalid'}}]),3);
});
