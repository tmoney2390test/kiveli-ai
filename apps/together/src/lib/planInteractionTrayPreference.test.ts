import{describe,expect,it}from'vitest';
import{planInteractionTrayPreferenceKey,shouldShowPlanInteractionTray}from'./planInteractionTrayPreference';

describe('plan interaction tray dismissal',()=>{
  it('keeps the tray hidden only for the dismissed active plan',()=>{
    expect(shouldShowPlanInteractionTray({activePlanId:'plan-a',dismissedPlanId:'plan-a',preferenceReady:true})).toBe(false);
    expect(shouldShowPlanInteractionTray({activePlanId:'plan-b',dismissedPlanId:'plan-a',preferenceReady:true})).toBe(true);
    expect(shouldShowPlanInteractionTray({activePlanId:null,dismissedPlanId:'plan-a',preferenceReady:true})).toBe(true);
  });

  it('waits for persisted preference hydration before showing an active-plan tray',()=>{
    expect(shouldShowPlanInteractionTray({activePlanId:'plan-a',dismissedPlanId:null,preferenceReady:false})).toBe(false);
  });

  it('scopes storage to both the account and plan',()=>{
    expect(planInteractionTrayPreferenceKey('user-a','plan-a')).not.toBe(planInteractionTrayPreferenceKey('user-b','plan-a'));
    expect(planInteractionTrayPreferenceKey('user-a','plan-a')).not.toBe(planInteractionTrayPreferenceKey('user-a','plan-b'));
  });
});
