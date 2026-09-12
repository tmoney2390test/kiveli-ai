// The public landing page is statically rendered. These viewport rules must be
// present in the HTML before hydration so desktop never paints as mobile first.
export const publicLandingWebCss = `
  #kivelli-landing-page { height: 100vh; height: 100dvh; }
  #kivelli-landing-visual {
    height: max(120px, min(54vh, calc(100vh - 362px - env(safe-area-inset-bottom, 0px))));
    height: max(120px, min(54dvh, calc(100dvh - 362px - env(safe-area-inset-bottom, 0px))));
  }
  #kivelli-landing-content {
    padding-bottom: max(24px, calc(env(safe-area-inset-bottom, 0px) + 18px));
  }
  @media (max-width: 379px) {
    #kivelli-landing-title { font-size: 42px; line-height: 44px; letter-spacing: -1.1px; }
  }
  @media (max-width: 899px) and (max-height: 699px) {
    #kivelli-landing-visual {
      height: max(120px, min(54dvh, calc(100dvh - 312px - env(safe-area-inset-bottom, 0px))));
    }
    #kivelli-landing-content {
      padding-top: 6px;
      padding-bottom: max(16px, calc(env(safe-area-inset-bottom, 0px) + 10px));
    }
    #kivelli-landing-title { font-size: 40px; line-height: 42px; }
    #kivelli-landing-actions { gap: 8px; margin-top: 16px; }
    #kivelli-landing-logo { transform: scale(0.823529); transform-origin: center bottom; }
  }
  @media (min-width: 900px) {
    #kivelli-landing-layout { flex-direction: row; }
    #kivelli-landing-visual { width: 58%; height: 100%; }
    #kivelli-landing-visual img { object-position: center center !important; }
    #kivelli-landing-fade {
      left: auto; top: 0; right: 0; bottom: 0; width: 90px; height: auto;
      background-image: linear-gradient(90deg, rgba(5,4,10,0) 0%, #05040A 100%);
    }
    #kivelli-landing-content {
      min-width: 390px; margin-top: 0; padding: 42px 6%;
      justify-content: center; align-items: center;
    }
    #kivelli-landing-title {
      max-width: 440px; text-align: left; font-size: 56px; line-height: 58px;
    }
    #kivelli-landing-logo {
      position: absolute; bottom: 36px; margin-top: 0;
      transform: scale(1.176471); transform-origin: center bottom;
    }
  }
`;
