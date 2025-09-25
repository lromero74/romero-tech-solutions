import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Environment Variables Debug:');
console.log('');
console.log('Raw environment values:');
console.log('DB_HOST:', JSON.stringify(process.env.DB_HOST));
console.log('DB_PORT:', JSON.stringify(process.env.DB_PORT));
console.log('DB_NAME:', JSON.stringify(process.env.DB_NAME));
console.log('DB_USER:', JSON.stringify(process.env.DB_USER));
console.log('DB_PASSWORD:', JSON.stringify(process.env.DB_PASSWORD));
console.log('DB_SSL:', JSON.stringify(process.env.DB_SSL));

console.log('');
console.log('Password analysis:');
const password = process.env.DB_PASSWORD;
if (password) {
  console.log('Password length:', password.length);
  console.log('Password first 10 chars:', JSON.stringify(password.substring(0, 10)));
  console.log('Password last 5 chars:', JSON.stringify(password.substring(password.length - 5)));
  console.log('Password contains special chars:', /[^a-zA-Z0-9]/.test(password));
} else {
  console.log('❌ DB_PASSWORD is undefined or empty');
}

console.log('');
console.log('Expected password: "ao1VKrmlD?e.(cg$<e-C2B*#]Uyg"');
console.log('Expected length:', "ao1VKrmlD?e.(cg$<e-C2B*#]Uyg".length);
console.log('Passwords match:', password === "ao1VKrmlD?e.(cg$<e-C2B*#]Uyg");