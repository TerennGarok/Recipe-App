import { useColorScheme } from 'react-native';

// Blue palette matching the app icon (scripts/make-icons.mjs). Swap in brand colors here.
export const Colors = {
  light: {
    text: '#14213D',
    textSecondary: '#5A6B85',
    background: '#F5F8FC',
    card: '#FFFFFF',
    border: '#D6E0EC',
    primary: '#1F4E8C',
    primaryText: '#FFFFFF',
    accent: '#2F7D5B',
    danger: '#B3261E',
    chip: '#E6EEF8',
  },
  dark: {
    text: '#EAF1FA',
    textSecondary: '#A3B3C9',
    background: '#0E1622',
    card: '#172231',
    border: '#2A3A50',
    primary: '#8FB8F0',
    primaryText: '#0E1622',
    accent: '#5CC293',
    danger: '#F2B8B5',
    chip: '#1E2D42',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

export function useTheme(): Palette {
  return Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
