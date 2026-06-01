import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const controllersFile = path.resolve(
  __dirname,
  '../controllers_by_category.md',
);

// Read list of controllers
const controllersMd = fs.readFileSync(controllersFile, 'utf8');
const fileRegex = /^- `([^`]+)`/gm;

const controllers = [];
let match;
while ((match = fileRegex.exec(controllersMd)) !== null) {
  controllers.push(match[1]);
}

const report = [];
report.push('# MVC Purity Analysis Report');
report.push(
  'Analyzing controllers for domain drift and UI/Model leakage based on agents.md.',
);
report.push('');

for (const relPath of controllers) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) {
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  let score = 100;
  const violations = [];

  // Rules from agents.md:
  // 1. MUST NOT decide what data means (complex mapping/filtering)
  // 2. MUST NOT merge sources of truth (Object.assign, spread operators on state)
  // 3. MUST NOT apply fallback logic (?? null / || default inside controller flow)
  // 4. MUST NOT manage detailed UI state (ref, reactive, computed inside controller instead of view-model)
  // 5. MUST NOT import UI components directly (.vue)

  // 1. UI Leakage
  const refMatch = content.match(/\bref\(/g);
  if (refMatch) {
    const count = refMatch.length;
    score -= count * 2;
    violations.push(`Found ${count} 'ref()' declarations (UI state leakage)`);
  }

  const computedMatch = content.match(/\bcomputed\(/g);
  if (computedMatch) {
    const count = computedMatch.length;
    score -= count * 1.5;
    violations.push(
      `Found ${count} 'computed()' derivations (View-Model leakage)`,
    );
  }

  const reactiveMatch = content.match(/\breactive\(/g);
  if (reactiveMatch) {
    const count = reactiveMatch.length;
    score -= count * 2;
    violations.push(
      `Found ${count} 'reactive()' declarations (UI state leakage)`,
    );
  }

  if (content.includes("from 'vue'") || content.includes('from "vue"')) {
    if (refMatch || computedMatch || reactiveMatch) {
      score -= 5;
      violations.push(`Imports 'vue' reactivity primitives directly`);
    }
  }

  if (/\.vue['"]/g.test(content)) {
    score -= 15;
    violations.push(`Directly imports .vue components (View layer leakage)`);
  }

  // 2. Model Leakage / Business Logic
  const filterMapReduce = content.match(/\.(filter|map|reduce)\s*\(/g);
  if (filterMapReduce && filterMapReduce.length > 5) {
    score -= 5;
    violations.push(
      `Contains frequent data transformations (${filterMapReduce.length} map/filter calls)`,
    );
  }

  const ifElse = content.match(/\bif\s*\(/g);
  if (ifElse && ifElse.length > 15) {
    score -= 5;
    violations.push(
      `High conditional branches (${ifElse.length}) - potential business rule leakage`,
    );
  }

  // 3. Truth Merging & Fallback logic
  const fallback = content.match(/\?\?/g);
  if (fallback && fallback.length > 5) {
    score -= 2;
    violations.push(
      `Frequent fallback logic / null coalescing (${fallback.length})`,
    );
  }

  // Floor score at 0
  score = Math.max(0, Math.round(score));

  let grade = '🟢 Excellent (MVC Pure)';
  if (score < 90) grade = '🟡 Fair (Minor Drift)';
  if (score < 75) grade = '🟠 Poor (Moderate Leakage)';
  if (score < 50) grade = '🔴 Violates Core Rules';

  report.push(`### ${path.basename(relPath)}`);
  report.push(`**Path**: \`${relPath}\``);
  report.push(`**Rating**: ${score}/100 - ${grade}`);

  if (violations.length > 0) {
    report.push('**Violations**:');
    for (const v of violations) {
      report.push(`- ${v}`);
    }
  } else {
    report.push('_No obvious domain drift or leakage detected._');
  }
  report.push('');
}

fs.writeFileSync(
  path.resolve(__dirname, '../mvc_purity_report.md'),
  report.join('\n'),
);
console.log('Report generated at mvc_purity_report.md');
