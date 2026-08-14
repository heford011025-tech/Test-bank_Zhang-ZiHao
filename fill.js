const fs = require('fs');
const path = require('path');

// 读取现有 questions.js
const src = fs.readFileSync(path.join(__dirname, 'questions.js'), 'utf8');
const marker = 'const questions = ';
const start = src.indexOf(marker) + marker.length;
const end = src.lastIndexOf('];');
if (start < marker.length || end < 0) throw new Error('questions.js 解析失败');

const arr = JSON.parse(src.slice(start, end + 1));

// 读取解析文件（每行一题，顺序对应）
const lines = fs.readFileSync(path.join(__dirname, '_explanations.txt'), 'utf8')
  .split(/\r?\n/)
  .filter(l => l.trim() !== '');

if (arr.length !== lines.length) {
  throw new Error(`数量不一致：题目 ${arr.length}，解析 ${lines.length}`);
}

arr.forEach((q, i) => { q.explanation = lines[i]; });

// 统计有解析/空解析
const empty = arr.filter(q => !q.explanation || !q.explanation.trim()).length;
console.log('题目总数:', arr.length, ' 空解析:', empty);

// 写回（保留原 header）
fs.writeFileSync(
  path.join(__dirname, 'questions.js'),
  src.slice(0, start) + JSON.stringify(arr, null, 2) + ';\n',
  'utf8'
);
console.log('已写入 questions.js，字节数:', fs.statSync(path.join(__dirname, 'questions.js')).size);
