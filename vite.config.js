import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/* Writes dist/sw.js from src/sw.js once the build is on disk: SHELL lists every built
   file, and VERSION is a hash of their contents, so any change ships a new worker. */
function serviceWorker(){
  let outDir;
  return {
    name: "myday-service-worker",
    apply: "build",
    configResolved(c){ outDir = c.build.outDir; },
    closeBundle(){
      const walk = d => readdirSync(d, {withFileTypes:true}).flatMap(f=>f.isDirectory() ? walk(join(d,f.name)) : [join(d,f.name)]);
      const files = walk(outDir).filter(f=>!f.endsWith("sw.js") && !f.endsWith(".map") && !f.endsWith(".DS_Store")).sort();
      const hash = createHash("sha256");
      files.forEach(f=>hash.update(f).update(readFileSync(f)));
      const shell = files.map(f=>"/"+relative(outDir, f).split(sep).join("/")).map(u=>u==="/index.html" ? "/" : u);
      const head = `const VERSION = ${JSON.stringify(hash.digest("hex").slice(0,12))};\nconst SHELL = ${JSON.stringify(shell, null, 2)};\n\n`;
      writeFileSync(join(outDir, "sw.js"), head + readFileSync("src/sw.js", "utf8"));
    }
  };
}

export default defineConfig({
  plugins: [serviceWorker()]
});
