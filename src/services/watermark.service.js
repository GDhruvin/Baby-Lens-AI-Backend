const { Jimp, loadFont, measureText, measureTextHeight } = require("jimp");
const path = require("path");

/**
 * Service to dynamically apply a brand watermark to an image buffer.
 * Compliant with Jimp v1.x API.
 * 
 * @param {Buffer} imageBuffer - The original high-resolution image buffer from Firebase
 * @returns {Promise<Buffer>} The watermarked image buffer
 */
async function applyWatermark(imageBuffer) {
  try {
    // 1. Read the original image buffer
    const img = await Jimp.read(imageBuffer);
    const width = img.bitmap.width;
    const height = img.bitmap.height;

    // 2. Load the built-in Jimp fonts using absolute file paths
    // Jimp has pre-rendered bitmap fonts bundled in @jimp/plugin-print, so this works completely offline.
    const fontLargePath = path.resolve(__dirname, "../../node_modules/@jimp/plugin-print/dist/fonts/open-sans/open-sans-32-white/open-sans-32-white.fnt");
    const fontSmallPath = path.resolve(__dirname, "../../node_modules/@jimp/plugin-print/dist/fonts/open-sans/open-sans-16-white/open-sans-16-white.fnt");
    
    const fontLarge = await loadFont(fontLargePath);
    const fontSmall = await loadFont(fontSmallPath);

    // 2.5. Load and overlay the brand logo in the top-right corner at 100% opacity
    try {
      const logoPath = path.resolve(__dirname, "../assets/logo.png");
      const logo = await Jimp.read(logoPath);
      const logoWidth = Math.round(width * 0.08); // Small size (8% of main image width)
      logo.resize({ w: logoWidth });
      
      const padding = 30; // Padding from top and right edges
      const logoX = width - logo.bitmap.width - padding;
      const logoY = padding;
      img.composite(logo, logoX, logoY);
    } catch (logoError) {
      console.warn("[watermarkService] Failed to overlay corner logo:", logoError);
      // Non-blocking fallback: if logo fails, continue applying the bottom banner
    }

    // 3. Draw a premium studio banner at the very bottom
    const footerHeight = 75;
    const footerY = height - footerHeight;

    // A rich, warm dark chocolate background for the footer (matching the brand colors)
    const footerBox = new Jimp({ width, height: footerHeight, color: 0x26140Acc }); // 0x26140Acc is deep warm dark brown at 80% opacity
    img.composite(footerBox, 0, footerY);

    // Draw a subtle, premium orange/peach accent divider line at the top of the footer
    const dividerHeight = 1;
    const dividerBox = new Jimp({ width, height: dividerHeight, color: 0xD05A2A55 }); // Brand orange with 33% opacity
    img.composite(dividerBox, 0, footerY);

    // 4. Print "BABYLENS STUDIO" on the left (Large Font)
    const textLeft = "BABYLENS STUDIO";
    const textLeftWidth = measureText(fontLarge, textLeft);
    const textLeftHeight = measureTextHeight(fontLarge, textLeft, textLeftWidth);
    const xLeft = 35;
    const yLeft = footerY + (footerHeight - textLeftHeight) / 2;
    img.print({ font: fontLarge, x: xLeft, y: yLeft, text: textLeft });

    // 5. Print "AI PORTRAIT | BABYLENS.APP" on the right (Small Font)
    const textRight = "AI PORTRAIT  |  BABYLENS.APP";
    const textRightWidth = measureText(fontSmall, textRight);
    const textRightHeight = measureTextHeight(fontSmall, textRight, textRightWidth);
    const xRight = width - textRightWidth - 35;
    const yRight = footerY + (footerHeight - textRightHeight) / 2;
    img.print({ font: fontSmall, x: xRight, y: yRight, text: textRight });

    // 6. Export the watermarked image back as a JPEG buffer
    return await img.getBuffer("image/jpeg");
  } catch (error) {
    console.error("[watermarkService] Failed to apply watermark:", error);
    // If watermarking fails, return the original buffer as a safe fallback
    return imageBuffer;
  }
}

module.exports = {
  applyWatermark,
};
