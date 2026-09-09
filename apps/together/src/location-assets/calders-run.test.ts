import {describe,expect,it} from 'vitest';
import {caldersRunLocationSlugs} from './calders-run-catalog';

describe("Calder's Run artwork",()=>{
  it('defines a unique image slot for every reviewed place',()=>{
    expect(caldersRunLocationSlugs).toHaveLength(53);
    expect(new Set(caldersRunLocationSlugs).size).toBe(caldersRunLocationSlugs.length);
    expect(caldersRunLocationSlugs).toEqual(expect.arrayContaining([
      'main-street','calder-house-hotel','river-market','the-railhead','crowcut-hollow',
    ]));
  });
});
