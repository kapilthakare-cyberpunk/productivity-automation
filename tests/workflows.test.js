const fs = require('fs');
const path = require('path');

const WORKFLOWS_DIR = path.join(__dirname, '../src/workflows');

describe('Workflow Validation', () => {
  const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'));
  
  files.forEach(file => {
    test(`${file} should be valid JSON`, () => {
      const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
      expect(() => JSON.parse(content)).not.toThrow();
    });
    
    test(`${file} should have required fields`, () => {
      const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
      const workflow = JSON.parse(content);
      
      expect(workflow.name).toBeDefined();
      expect(workflow.nodes).toBeDefined();
      expect(Array.isArray(workflow.nodes)).toBe(true);
      expect(workflow.connections).toBeDefined();
    });
    
    test(`${file} nodes should have required properties`, () => {
      const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
      const workflow = JSON.parse(content);
      
      workflow.nodes.forEach(node => {
        expect(node.name).toBeDefined();
        expect(node.type).toBeDefined();
        expect(node.position).toBeDefined();
        expect(Array.isArray(node.position)).toBe(true);
      });
    });
  });
});

describe('Project Structure', () => {
  test('should have package.json', () => {
    expect(fs.existsSync(path.join(__dirname, '../package.json'))).toBe(true);
  });
  
  test('should have README.md', () => {
    expect(fs.existsSync(path.join(__dirname, '../README.md'))).toBe(true);
  });
  
  test('should have .env.example', () => {
    expect(fs.existsSync(path.join(__dirname, '../.env.example'))).toBe(true);
  });
  
  test('should have .gitignore', () => {
    expect(fs.existsSync(path.join(__dirname, '../.gitignore'))).toBe(true);
  });
});
