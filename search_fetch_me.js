const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      if (file.endsWith('.js') || file.endsWith('.jsx')) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

const files = walk(path.join(__dirname, '../flashcard-frontend/src'));
console.log('Searching for "getMe" or "users/me" in frontend source files:');
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('getMe') || content.includes('users/me')) {
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (line.includes('getMe') || line.includes('users/me')) {
        console.log(`${path.basename(file)}:L${index + 1} - ${line.trim()}`);
      }
    });
  }
});
