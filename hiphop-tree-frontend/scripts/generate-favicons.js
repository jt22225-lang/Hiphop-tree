const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const faviconSvgPath = path.join(__dirname, '../public/favicon.svg');
const publicDir = path.join(__dirname, '../public');

const svgBuffer = fs.readFileSync(faviconSvgPath);

// Generate favicons at different sizes
const sizes = [
  { size: 16, filename: 'favicon-16x16.png' },
  { size: 32, filename: 'favicon-32x32.png' },
  { size: 180, filename: 'apple-touch-icon.png' },
];

async function generateFavicons() {
  try {
    for (const { size, filename } of sizes) {
      await sharp(svgBuffer)
        .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toFile(path.join(publicDir, filename));
      console.log(`✓ Generated ${filename}`);
    }
    console.log('✓ All favicons generated successfully');
  } catch (err) {
    console.error('Error generating favicons:', err);
    process.exit(1);
  }
}

generateFavicons();
