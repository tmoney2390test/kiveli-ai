import{describe,expect,it,vi}from'vitest';
import{handlePhotoSharingTap}from'./photoSharing';

describe('photo sharing access',()=>{
  it('opens the native picker for a subscriber tap',()=>{const openPicker=vi.fn(),openPaywall=vi.fn();expect(handlePhotoSharingTap(true,{openPicker,openPaywall})).toBe('picker');expect(openPicker).toHaveBeenCalledOnce();expect(openPaywall).not.toHaveBeenCalled();});
  it('opens the Kivelle+ paywall without opening the picker for a non-subscriber',()=>{const openPicker=vi.fn(),openPaywall=vi.fn();expect(handlePhotoSharingTap(false,{openPicker,openPaywall})).toBe('paywall');expect(openPaywall).toHaveBeenCalledOnce();expect(openPicker).not.toHaveBeenCalled();});
});
