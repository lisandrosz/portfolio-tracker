import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @libsql/client pulls in the native `libsql` addon for local file mode.
  // Mark it external so Next doesn't try to bundle the .node binary.
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
