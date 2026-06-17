#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORKFLOWS_DIR = path.join(__dirname, '../src/workflows');

function validateWorkflow(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const workflow = JSON.parse(content);
  
  const errors = [];
  
  // Check required fields
  if (!workflow.name) errors.push('Missing workflow name');
  if (!workflow.nodes || !Array.isArray(workflow.nodes)) errors.push('Missing or invalid nodes array');
  if (!workflow.connections) errors.push('Missing connections');
  
  // Check each node
  if (workflow.nodes) {
    workflow.nodes.forEach((node, i) => {
      if (!node.name) errors.push(`Node ${i}: Missing name`);
      if (!node.type) errors.push(`Node ${i}: Missing type`);
      if (!node.position || !Array.isArray(node.position)) errors.push(`Node ${i}: Missing or invalid position`);
    });
  }
  
  return {
    file: path.basename(filePath),
    valid: errors.length === 0,
    errors,
    nodeCount: workflow.nodes?.length || 0
  };
}

// Validate all workflows
const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'));

console.log('Validating workflows...\n');

let allValid = true;
files.forEach(file => {
  const result = validateWorkflow(path.join(WORKFLOWS_DIR, file));
  const status = result.valid ? '✅' : '❌';
  console.log(`${status} ${result.file} (${result.nodeCount} nodes)`);
  
  if (!result.valid) {
    allValid = false;
    result.errors.forEach(err => console.log(`   - ${err}`));
  }
});

console.log('\n' + (allValid ? '✅ All workflows valid' : '❌ Some workflows have errors'));
process.exit(allValid ? 0 : 1);
