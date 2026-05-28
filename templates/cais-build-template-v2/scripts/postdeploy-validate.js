/**
 * Post-deployment validation script
 * 
 * Runs after Vercel deployment to verify the site is working.
 * Called automatically after npm run build completes on Vercel.
 * 
 * Validation checklist:
 * 1. Homepage loads
 * 2. Login page loads  
 * 3. Auth callback works
 * 
 * Run manually: npm run postdeploy:validate
 */

const https = require('https');

const urls = [
  { url: '/', name: 'Homepage' },
  { url: '/login', name: 'Login' },
  { url: '/auth/callback', name: 'Auth Callback' },
];

const BASE_URL = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL || 'localhost:3000';

async function checkUrl(path) {
  return new Promise((resolve) => {
    const isLocalhost = BASE_URL.includes('localhost');
    const options = {
      hostname: isLocalhost ? 'localhost' : BASE_URL,
      port: isLocalhost ? 3000 : 443,
      path: path,
      method: 'GET',
      timeout: 10000,
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 400,
        });
      });
    });

    req.on('error', () => {
      resolve({ status: 0, ok: false });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, ok: false });
    });

    req.end();
  });
}

async function main() {
  console.log(`🔍 Post-deployment validation for ${BASE_URL}`);
  console.log('');

  let allPassed = true;

  for (const { url, name } of urls) {
    process.stdout.write(`Checking ${name} (${url})... `);
    const result = await checkUrl(url);
    
    if (result.ok) {
      console.log(`✅ ${result.status}`);
    } else {
      console.log(`❌ ${result.status || 'ERROR'}`);
      allPassed = false;
    }
  }

  console.log('');
  if (allPassed) {
    console.log('✅ All post-deployment checks passed!');
    process.exit(0);
  } else {
    console.log('❌ Some checks failed. Review the deployment.');
    process.exit(1);
  }
}

main();
