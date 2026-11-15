import { useColorScheme } from 'react-native';

export const Colors = {
  light: {
    text: '#2B2118',
    textSecondary: '#6F6257',
    background: '#FBF7F2',
    card: '#FFFFFF',
    border: '#E8DFD5',
    primary: '#B5532B',
    primaryText: '#FFFFFF',
    accent: '#2F7D5B',
    danger: '#B3261E',
    chip: '#F1E7DC',
  },
  dark: {
    text: '#F3ECE4',
    textSecondary: '#B4A89C',
    background: '#16120F',
    card: '#221C17',
    border: '#3A3129',
    primary: '#E07A4C',
    primaryText: '#1A120C',
    accent: '#5CC293',
    danger: '#F2B8B5',
    chip: '#2E261F',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

export function useTheme(): Palette {
  return Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
