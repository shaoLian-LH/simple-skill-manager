import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Config } from 'tailwindcss';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default {
  content: [path.join(repoRoot, 'src/ui/web/app/**/*.{vue,ts,tsx,js,jsx,html}')],
  theme: {
    extend: {
      colors: {
        charcoal: '#242424',
        midnight: '#111111',
        muted: '#898989',
        canvas: '#ffffff',
        subtle: '#f5f5f5',
        link: '#0099ff',
      },
      fontFamily: {
        display: ['"Avenir Next"', '"Inter"', '"Segoe UI"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"Roboto Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: 'rgba(19, 19, 22, 0.7) 0px 1px 5px -4px, rgba(34, 42, 53, 0.08) 0px 0px 0px 1px, rgba(34, 42, 53, 0.05) 0px 4px 8px 0px',
        'card-strong':
          'rgba(19, 19, 22, 0.72) 0px 1px 6px -4px, rgba(34, 42, 53, 0.08) 0px 0px 0px 1px, rgba(34, 42, 53, 0.08) 0px 18px 36px -18px',
        surface: 'rgba(34, 42, 53, 0.05) 0px 4px 8px 0px',
        'inset-highlight': 'rgba(255, 255, 255, 0.15) 0px 2px 0px inset',
      },
      borderRadius: {
        button: '8px',
        card: '12px',
        shell: '16px',
        pill: '9999px',
      },
      maxWidth: {
        workbench: '1480px',
      },
    },
  },
  plugins: [],
} satisfies Config;
