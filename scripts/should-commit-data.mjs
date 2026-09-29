import { execFileSync } from 'node:child_process';
import { readFile, appendFile } from 'node:fs/promises';
const next = JSON.parse(await readFile('data/typhoons.json', 'utf8'));
let previous = null;
try { previous = JSON.parse(execFileSync('git', ['show', 'HEAD:data/typhoons.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch {}
const contentChanged = JSON.stringify(previous?.storms) !== JSON.stringify(next.storms);
const newDay = previous?.fetchedAt?.slice(0, 10) !== next.fetchedAt?.slice(0, 10);
const changed = contentChanged || newDay;
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
console.log(changed ? '保存新的观测版本或每日数据检查点。' : '观测内容未变化，无需额外提交。');
