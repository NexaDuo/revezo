/** @type {import('tailwindcss').Config} */

// Paleta "quadro da escala": tecido de hospital no fundo, tinta de caneta
// esferográfica no texto, azul de caneta nas ações, e as cores do quadro de
// plantão (manhã/tarde) e do marca-texto da conferência.
// `slate` é redefinido para os neutros tingidos de tinta — o app inteiro já
// usa essa escala, então trocar aqui recolore sem espalhar classe nova.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Atkinson Hyperlegible Next"', 'system-ui', 'sans-serif'],
      },
      colors: {
        slate: {
          50: '#F3F5F4',
          100: '#E6EBEA',
          200: '#D3DADA',
          300: '#B4BFC1',
          400: '#88959A',
          500: '#627078',
          600: '#48555E',
          700: '#35424B',
          800: '#27333C',
          900: '#1D2A35',
          950: '#121B22',
        },
        caneta: {
          50: '#EEF2FC',
          100: '#DCE4F8',
          200: '#B9C8F0',
          300: '#8EA5E4',
          400: '#5F7ED3',
          500: '#3A5CC4',
          600: '#2748B3',
          700: '#1F3A93',
          800: '#1A3076',
          900: '#16275C',
        },
        manha: { DEFAULT: '#FBE7B0', tinta: '#6B4A00' },
        tarde: { DEFAULT: '#D3E3F6', tinta: '#1F3A5F' },
        marca: { DEFAULT: '#FFE45C', rigida: '#D13438' },
      },
    },
  },
  plugins: [],
}
