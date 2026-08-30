import{colors}from'../theme';
import type{Theme}from'expo-router';

export function createKivelliNavigationTheme(base:Theme):Theme{
  return{
    ...base,
    dark:true,
    colors:{
      ...base.colors,
      primary:colors.rose,
      background:colors.background,
      card:colors.background,
      text:colors.text,
      border:colors.border,
      notification:colors.rose,
    },
  };
}
