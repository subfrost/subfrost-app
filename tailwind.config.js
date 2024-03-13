const defaultTheme = require('tailwindcss/defaultTheme')

module.exports = {
  content: ['./dist/**/*.html', './src/**/*.{js,jsx,ts,tsx}', './*.html'],
  plugins: [require('@tailwindcss/forms')],
  variants: {
    extend: {
      fontFamily: {
        ionicons: ['ionicons', ...defaultTheme.fontFamily.sans]
      },
      colors: {
        brand: {
          midnightblue: '#032131',
          blue: '#2274a5',
          lightblue: '#bdedfa',
          orange: '#ffb472'
        }
      },
      opacity: ['disabled']
    }
  }
}
