import type { Config } from 'tailwindcss';

export default {
  content: ['./src/ui/web/app/**/*.{vue,ts,tsx,js,jsx,html}'],
  theme: {
    extend: {
      colors: {
        paper: '#f7eee3',
        sand: '#e8d6c0',
        ink: '#2d261f',
        olive: '#6f7e54',
        copper: '#ba6a3f',
      },
      fontFamily: {
        display: ['"Fraunces"', '"Iowan Old Style"', 'serif'],
        body: ['"Plus Jakarta Sans"', '"Avenir Next"', 'sans-serif'],
      },
      boxShadow: {
        workbench: '0 26px 60px rgba(86, 55, 31, 0.12)',
      },
      borderRadius: {
        shell: '28px',
      },
    },
  },
  plugins: [],
} satisfies Config;
