import { createContext, useContext } from 'react';

export type Theme = 'dark' | 'light';

// Single source of truth for every Recharts colour. Mirrors the palette tokens in styles.css.
export const chartTokens = {
  dark: {
    series1: '#4F7CFF',
    series1Muted: '#2C4380',
    series2: '#3CC4DC',
    fillOpacity: 0.26,
    negative: '#F0616D',
    grid: 'rgba(143, 155, 179, 0.12)',
    axis: '#6F7B94',
    cursor: 'rgba(124, 165, 255, 0.28)',
    track: 'rgba(124, 165, 255, 0.06)',
    surface: '#10182A',
    label: '#C7D0E2'
  },
  light: {
    series1: '#3A62E8',
    series1Muted: '#B9C9F6',
    series2: '#0B93AB',
    fillOpacity: 0.18,
    negative: '#C8414E',
    grid: 'rgba(30, 45, 80, 0.08)',
    axis: '#7A8498',
    cursor: 'rgba(58, 98, 232, 0.25)',
    track: 'rgba(58, 98, 232, 0.05)',
    surface: '#FFFFFF',
    label: '#3B4558'
  }
} as const;

export type ChartTokens = (typeof chartTokens)[Theme];

export const ChartThemeContext = createContext<ChartTokens>(chartTokens.dark);
export const useChartTheme = () => useContext(ChartThemeContext);
