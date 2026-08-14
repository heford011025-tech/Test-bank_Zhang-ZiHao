const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '_xlsx');
const ss = fs.readFileSync(path.join(dir, 'xl/sharedStrings.xml'), 'utf8');
const sheet = fs.readFileSync(path.join(dir, 'xl/worksheets/sheet1.xml'), 'utf8');

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)));
}

// 解析 sharedStrings
const shared = [];
{
  const re = /<si>([\s\S]*?)<\/si>/g; let m;
  while ((m = re.exec(ss)) !== null) {
    let text = '';
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g; let t;
    while ((t = tRe.exec(m[1])) !== null) text += t[1];
    shared.push(decodeEntities(text));
  }
}

// 解析 sheet —— 关键：正确识别自闭合单元格 <c .../>
function parseRows(xml) {
  const rows = [];
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g; let rm;
  while ((rm = rowRe.exec(xml)) !== null) {
    const cells = {};
    // 单元格：<c attrs/> （自闭合） 或 <c attrs>内容</c>
    const cRe = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let cm;
    while ((cm = cRe.exec(rm[2])) !== null) {
      const attrs = cm[1], body = cm[2] || '';
      const rM = attrs.match(/r="([A-Z]+)\d+"/); if (!rM) continue;
      const letter = rM[1];
      const tM = attrs.match(/t="([^"]+)"/); const t = tM ? tM[1] : 'n';
      let val = '';
      if (t === 's') { const v = body.match(/<v>(\d+)<\/v>/); if (v) val = shared[parseInt(v[1], 10)] || ''; }
      else if (t === 'inlineStr') { const tt = body.match(/<t[^>]*>([\s\S]*?)<\/t>/); if (tt) val = decodeEntities(tt[1]); }
      else { const v = body.match(/<v>([\s\S]*?)<\/v>/); if (v) val = decodeEntities(v[1]); }
      cells[letter] = val;
    }
    rows.push({ n: parseInt(rm[1], 10), cells });
  }
  return rows;
}

const rows = parseRows(sheet);

// 字段（列字母）：A序号 D题型 E题干 F选项A G选项B H选项C I选项D L答案
function buildQuestion(cells) {
  const typeRaw = (cells['D'] || '').trim();
  const question = (cells['E'] || '').trim();
  const opts = [cells['F'], cells['G'], cells['H'], cells['I']].map(s => (s || '').trim()).filter(Boolean);
  const ans = (cells['L'] || '').trim();

  if (typeRaw.indexOf('单选') >= 0) {
    return { type: 'single', question, options: opts, answer: ans.toUpperCase(), explanation: '' };
  } else if (typeRaw.indexOf('多选') >= 0) {
    return { type: 'multi', question, options: opts, answer: ans.replace(/[^A-Za-z]/g, '').toUpperCase().split(''), explanation: '' };
  } else { // 判断：A=正确 B=错误
    const r = ans.toUpperCase();
    const ok = (r === 'A' || r === '正确' || r === '对' || r === '√' || r === 'T');
    return { type: 'judge', question, options: ['正确', '错误'], answer: ok ? '正确' : '错误', explanation: '' };
  }
}

const dataRows = rows.filter(r => r.n > 1 && (r.cells['E'] || '').trim() !== '');
const questions = dataRows.map(r => buildQuestion(r.cells));

// ---------- 汇总 ----------
const tc = {};
questions.forEach(q => tc[q.type] = (tc[q.type] || 0) + 1);
console.log('总题数:', questions.length, JSON.stringify(tc));

const badSingle = questions.filter(q => q.type === 'single' && !/^[A-D]$/.test(q.answer)).length;
const badMulti = questions.filter(q => q.type === 'multi' && q.answer.length === 0).length;
console.log('单选非法答案(非A-D):', badSingle, ' 多选空答案:', badMulti);

const sa = {};
questions.filter(q => q.type === 'single').forEach(q => sa[q.answer] = (sa[q.answer] || 0) + 1);
console.log('单选题答案分布:', JSON.stringify(sa));
const ma = {};
questions.filter(q => q.type === 'multi').forEach(q => { const k = q.answer.join(''); ma[k] = (ma[k] || 0) + 1; });
console.log('多选答案分布:', JSON.stringify(ma));
const ja = {};
questions.filter(q => q.type === 'judge').forEach(q => ja[q.answer] = (ja[q.answer] || 0) + 1);
console.log('判断答案分布:', JSON.stringify(ja));

console.log('\n=== 每题型2条样例 ===');
const seen = {};
for (const q of questions) {
  seen[q.type] = (seen[q.type] || 0) + 1;
  if (seen[q.type] <= 2) {
    console.log('[' + q.type + '] ' + q.question.slice(0, 36));
    console.log('   选项:', JSON.stringify(q.options));
    console.log('   答案:', JSON.stringify(q.answer));
  }
}

// ---------- 生成 questions.js（解析暂空，后续填入 AI 解析） ----------
const header = `// ============================================================
//  题库数据 —— 由 parse.js 从《附件3.安规考题(400道）.xlsx》自动生成
//  共 ${questions.length} 道：单选 ${tc.single || 0} / 多选 ${tc.multi || 0} / 判断 ${tc.judge || 0}
// ============================================================
const questions = `;
fs.writeFileSync(path.join(__dirname, 'questions.js'), header + JSON.stringify(questions, null, 2) + ';\n', 'utf8');
console.log('\n已生成 questions.js，字节数:', fs.statSync(path.join(__dirname, 'questions.js')).size);
