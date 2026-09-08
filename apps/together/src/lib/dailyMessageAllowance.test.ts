import{describe,expect,it}from'vitest';
import{currentDailyMessageAllowance,dailyMessageAllowancePresentation,isDailyMessageAllowanceExhausted}from'./dailyMessageAllowance';

describe('daily message allowance presentation',()=>{
  const beforeReset=Date.parse('2026-09-08T12:00:00.000Z');
  it('starts warning at five remaining messages',()=>{
    expect(dailyMessageAllowancePresentation({limit:20,used:14,remaining:6,resetAt:'2026-09-09T00:00:00.000Z'},beforeReset)).toBeNull();
    expect(dailyMessageAllowancePresentation({limit:20,used:15,remaining:5,resetAt:'2026-09-09T00:00:00.000Z'},beforeReset)).toEqual({copy:'5 free messages left today.',exhausted:false});
  });

  it('uses singular copy for the final message',()=>{
    expect(dailyMessageAllowancePresentation({limit:20,used:19,remaining:1,resetAt:'2026-09-09T00:00:00.000Z'},beforeReset)).toEqual({copy:'1 free message left today.',exhausted:false});
  });

  it('shows the exhausted state and ignores unlimited accounts',()=>{
    expect(dailyMessageAllowancePresentation({limit:20,used:20,remaining:0,resetAt:'2026-09-09T00:00:00.000Z'},beforeReset)).toEqual({copy:'You’ve used today’s 20 free messages.',exhausted:true});
    expect(dailyMessageAllowancePresentation({limit:null,used:null,remaining:null,resetAt:'2026-09-09T00:00:00.000Z'},beforeReset)).toBeNull();
  });

  it('reopens sending after the UTC allowance window resets',()=>{
    const expired={limit:20,used:20,remaining:0,resetAt:'2026-09-09T00:00:00.000Z'};
    expect(isDailyMessageAllowanceExhausted(expired,Date.parse('2026-09-09T00:00:01.000Z'))).toBe(false);
    expect(currentDailyMessageAllowance(expired,Date.parse('2026-09-09T00:00:01.000Z'))).toMatchObject({limit:20,used:0,remaining:20});
  });
});
