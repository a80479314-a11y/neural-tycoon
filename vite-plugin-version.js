import fs from 'fs';
import path from 'path';

export default function versionPlugin() {
  return {
    name: 'vite-plugin-version',
    writeBundle(options, bundle) {
      const distDir = options.dir || 'dist';
      const version = Date.now().toString();
      const versionData = { version, timestamp: new Date().toISOString() };
      
      fs.writeFileSync(
        path.join(distDir, 'version.json'),
        JSON.stringify(versionData, null, 2)
      );
      
      console.log(`[version-plugin] Generated version.json: ${version}`);
    }
  };
}
