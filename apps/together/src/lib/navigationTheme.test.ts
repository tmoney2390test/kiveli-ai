import{describe,expect,it}from'vitest';
import{colors}from'../theme';
import{createKivelliNavigationTheme}from'./navigationTheme';

describe('Kivelli navigation theme',()=>{
  it('keeps every navigator-owned transition surface dark',()=>{
    const fonts={regular:{fontFamily:'sans',fontWeight:'400' as const},medium:{fontFamily:'sans',fontWeight:'500' as const},bold:{fontFamily:'sans',fontWeight:'600' as const},heavy:{fontFamily:'sans',fontWeight:'700' as const}};
    const theme=createKivelliNavigationTheme({dark:false,colors:{primary:'blue',background:'rgb(242, 242, 242)',card:'white',text:'black',border:'gray',notification:'red'},fonts});
    expect(theme.dark).toBe(true);
    expect(theme.colors.background).toBe(colors.background);
    expect(theme.colors.card).toBe(colors.background);
    expect(theme.colors.text).toBe(colors.text);
    expect(theme.fonts).toBe(fonts);
  });
});
