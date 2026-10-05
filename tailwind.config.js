// ============================================================
// E-VISIOCAM — configuration Tailwind (compilée une fois, plus de CDN)
// Recompiler après avoir ajouté des classes Tailwind dans une page :
//   npx tailwindcss@3 -c tailwind/tailwind.config.js -i tailwind/input.css -o tailwind.css --minify
// (depuis la racine du site)
// ============================================================
module.exports = {
    content: ['./*.html', './*.js'],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#fdf2f8', 100: '#fce7f3', 500: '#ec4899', 600: '#e11d48',
                    primary: '#e91e63', hover: '#d81b60', dark: '#881337'
                },
                darkpurple: '#1a0b2e',
                carddark: '#24143a'
            },
            fontFamily: { sans: ['Inter', 'sans-serif'] }
        }
    }
};
