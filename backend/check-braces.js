import { readFileSync } from 'fs';

const content = readFileSync('./routes/admin/users.js', 'utf8');
const lines = content.split('\n');

// Find the router.put function
let putStartLine = -1;
let putEndLine = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("router.put('/users/:id'")) {
    putStartLine = i;
    break;
  }
}

// Count braces from the put function start
let braceCount = 0;
let inPutFunction = false;

for (let i = putStartLine; i < lines.length; i++) {
  const line = lines[i];

  if (i === putStartLine) {
    inPutFunction = true;
  }

  if (inPutFunction) {
    // Count opening braces
    const openBraces = (line.match(/\{/g) || []).length;
    // Count closing braces
    const closeBraces = (line.match(/\}/g) || []).length;

    braceCount += openBraces - closeBraces;

    console.log(`Line ${i + 1}: "${line.trim()}" | Braces: +${openBraces} -${closeBraces} | Total: ${braceCount}`);

    // If we've returned to 0 braces after starting the function, we've found the end
    if (braceCount === 0 && i > putStartLine) {
      putEndLine = i;
      break;
    }
  }
}

console.log(`\nPUT function spans from line ${putStartLine + 1} to line ${putEndLine + 1}`);

if (braceCount !== 0) {
  console.log(`❌ Brace mismatch! Final count: ${braceCount}`);
} else {
  console.log(`✅ Braces are balanced!`);
}