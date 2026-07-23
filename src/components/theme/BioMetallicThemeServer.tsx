/**
 * SSR injector — pushes Image 3 bio-metallic CSS variables into the document
 * before hydration so client layouts never flash stale blue theme artifacts.
 */

import {
  getTextureMatrix,
  textureCssVariablesToInlineStyle,
} from "@/lib/theme/textureMatrix";

export default function BioMetallicThemeServer() {
  const matrix = getTextureMatrix();
  const inline = textureCssVariablesToInlineStyle(matrix.cssVariables);

  return (
    <>
      <style
        id="bio-metallic-texture-vars"
        data-theme={matrix.theme}
        data-theme-version={matrix.version}
        data-cache-key={matrix.cacheKey}
        dangerouslySetInnerHTML={{
          __html: `:root{${inline}}html{color-scheme:dark;background-color:${matrix.colors.baseVoid}}`,
        }}
      />
      <meta name="theme-color" content={matrix.colors.baseVoid} />
      <meta name="color-scheme" content="dark" />
      <meta name="x-scale-theme" content={matrix.theme} />
      <meta name="x-scale-theme-version" content={String(matrix.version)} />
    </>
  );
}
