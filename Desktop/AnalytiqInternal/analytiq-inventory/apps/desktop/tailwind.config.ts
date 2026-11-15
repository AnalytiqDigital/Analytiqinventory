import type { Config } from 'tailwindcss';

export default {
 content: ['./index.html', './src/**/*.{ts,tsx}'],
 darkMode: 'class',
 theme: {
 extend: {
 colors: {
 brand: {
 50: '#fff7ed',
 100: '#ffedd5',
 200: '#fed7aa',
 300: '#fdba74',
 400: '#fb923c',
 500: '#f97316',
 600: '#ea580c',
 700: '#c2410c',
 800: '#9a3412',
 900: '#7c2d12',
 950: '#431407',
 },
 },
 boxShadow: {
 card: '0 1px 2px rgb(15 23 42 / 0.05), 0 4px 16px -4px rgb(15 23 42 / 0.08)',
 pop: '0 12px 40px -8px rgb(15 23 42 / 0.25)',
 },
 keyframes: {
 'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
 'slide-up': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
 'scale-in': { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
 },
 animation: {
 'fade-in': 'fade-in 0.18s ease-out',
 'slide-up': 'slide-up 0.25s ease-out',
 'scale-in': 'scale-in 0.16s ease-out',
 },
 },
 },
 plugins: [],
} satisfies Config;
