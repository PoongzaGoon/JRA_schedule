import { passwordHash } from '../src/auth.js';
// Read via stdin; never accept passwords in process arguments.
let password = '';
if (process.stdin.isTTY) {
  process.stdout.write('새 관리자 비밀번호 (12자 이상, 입력 숨김): ');
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  password = await new Promise(resolve => {
    process.stdin.on('data', chunk => {
      if (chunk.includes('\u0003')) process.exit(1);
      for (const char of chunk) {
        if (char === '\r' || char === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); return resolve(password); }
        if (char === '\u007f') password = password.slice(0, -1);
        else password += char;
      }
    });
  });
  process.stdout.write('\n');
} else {
  for await (const chunk of process.stdin) password += chunk;
  password = password.replace(/\r?\n$/, '');
}
try { console.log(await passwordHash(password)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
