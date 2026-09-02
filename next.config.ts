import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * @react-pdf/renderer reaches into pdfkit, which loads its AFM metrics for the
   * standard PDF fonts with a runtime require of `js/standard-fonts/<Font>.cjs`.
   * Bundling swallows that path, so a deployed export dies with MODULE_NOT_FOUND;
   * keeping the renderer external and tracing the font data into the function
   * output makes server-side PDF generation work off the filesystem as it does
   * locally.
   */
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: {
    "/api/export": ["./node_modules/pdfkit/js/standard-fonts/**", "./public/infinit-logo.png"],
    "/help/changelog": ["./CHANGELOG.md"],
  },
};

export default nextConfig;
