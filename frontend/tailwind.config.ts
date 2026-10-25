import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cbt: {
          primary: '#1E40AF',
          accent: '#2563EB',
          surface: '#EFF6FF',
          slate: '#0F172A',
        },
      },
    },
  },
  plugins: [],
};

export default config;
