const fs = require('fs');
const path = require('path');

const modelsFile = path.resolve(__dirname, '../models_by_category.md');

// Read list of models
const modelsMd = fs.readFileSync(modelsFile, 'utf8');
const fileRegex = /^- `([^`]+)`/gm;

const models = [];
let match;
while ((match = fileRegex.exec(modelsMd)) !== null) {
  let filepath = match[1];
  // Convert any potentially weird paths to relative
  if (
    filepath.startsWith('backend/') ||
    filepath.startsWith('frontend/') ||
    filepath.startsWith('shared/')
  ) {
    models.push(filepath);
  }
}

const report = [];
report.push('# Model Purity Analysis Report');
report.push(
  'Analyzing Model files for domain drift and UI/Controller leakage based on agents.md.',
);
report.push('');

let totalScore = 0;
let fileCount = 0;

for (const relPath of models) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) {
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  let score = 100;
  const violations = [];

  // Rules from agents.md:
  // MODEL MUST NOT:
  // - UI state, rendering, layout, interaction handling, animation, navigation flow, view-specific grouping
  // - Controller leak: routing intent, orchestrating execution order, wiring modules together

  if (content.includes('.vue')) {
    score -= 20;
    violations.push('Directly references .vue components (UI Leakage)');
  }

  if (content.match(/\b(useRouter|useRoute)\b/)) {
    score -= 15;
    violations.push('Uses Vue Router (Navigation Flow Leakage)');
  }

  // Model files are often stores/services, but shouldn't manipulate DOM
  if (content.match(/\b(document\.|window\.|addEventListener)\b/)) {
    score -= 15;
    violations.push('Direct DOM/Window manipulation (UI/Interaction Leakage)');
  }

  // Look for CSS/SCSS
  if (content.match(/\.(css|scss|less)/)) {
    score -= 20;
    violations.push('References stylesheets (Rendering/Layout Leakage)');
  }

  // Check for orchestration concepts that usually go to controllers
  // e.g., orchestrator, traffic, controller
  if (relPath.includes('domain/') || relPath.includes('store')) {
    // If it's a domain/store, it shouldn't contain controller logic
    if (content.match(/\b(Controller|Handler|orchestrate|Manager)\b/i)) {
      // but wait, might be types or valid domain names, score minorly
      const count = (
        content.match(/\b(Controller|Handler|orchestrate)\b/gi) || []
      ).length;
      if (count > 2) {
        score -= count;
        violations.push(
          `Contains potential Controller terminology (${count} occurrences)`,
        );
      }
    }
  }

  // Models shouldn't be handling click/keyboard intents
  if (content.match(/\b(onClick|onKey|keyboard|mouse)\b/i)) {
    score -= 10;
    violations.push(
      'Contains presentation interaction naming (onClick, mouse, keyboard)',
    );
  }

  // Floor score at 0
  score = Math.max(0, Math.round(score));

  let grade = '🟢 Excellent (MVC Pure)';
  if (score < 90) grade = '🟡 Fair (Minor Drift)';
  if (score < 75) grade = '🟠 Poor (Moderate Leakage)';
  if (score < 50) grade = '🔴 Violates Core Rules';

  // Only report if there are violations, otherwise it'll be too big maybe
  // Actually the prompt said "look into eveyone one of them and rate them"
  report.push(`### ${path.basename(relPath)}`);
  report.push(`**Path**: \`${relPath}\``);
  report.push(`**Rating**: ${score}/100 - ${grade}`);

  if (violations.length > 0) {
    report.push('**Violations**:');
    for (const v of violations) {
      report.push(`- ${v}`);
    }
  } else {
    report.push('_No obvious domain drift or UI/Controller leakage detected._');
  }
  report.push('');

  totalScore += score;
  fileCount++;
}

if (fileCount > 0) {
  report.splice(
    3,
    0,
    `**Overall Model Purity Score**: ${Math.round(totalScore / fileCount)}/100 across ${fileCount} files.`,
  );
  report.splice(4, 0, '');
}

fs.writeFileSync(
  path.resolve(__dirname, '../model_purity_report.md'),
  report.join('\n'),
);
console.log('Report generated at model_purity_report.md');
