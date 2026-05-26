const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const backendEnv = path.join(rootDir, 'backend', '.env');
const frontendEnv = path.join(rootDir, 'frontend', '.env');
const exampleEnv = path.join(rootDir, '.env.example');

console.log('🏁 Starting development environment bootstrap...');

if (!fs.existsSync(exampleEnv)) {
  console.error(`❌ Error: .env.example not found at ${exampleEnv}`);
  process.exit(1);
}

// Helper to copy template
function setupEnvFile(destPath, label) {
  if (!fs.existsSync(destPath)) {
    console.log(`📝 Generating missing ${label} environment file...`);
    try {
      fs.copyFileSync(exampleEnv, destPath);
      console.log(`✅ Created ${label} environment file at ${destPath}`);
    } catch (err) {
      console.error(`❌ Failed to create ${label} environment file:`, err.message);
      process.exit(1);
    }
  } else {
    console.log(`✔ ${label} environment file already exists.`);
  }
}

setupEnvFile(backendEnv, 'Backend (.env)');
setupEnvFile(frontendEnv, 'Frontend (.env)');

console.log('🚀 Bootstrap complete! Proceeding to launch Docker containers...');
