// Test warning parsing
const testOutput = `Compiling 24 files with Solc 0.8.30
Solc 0.8.30 finished in 651.28ms
Compiler run successful with warnings:
Warning (5667): Unused function parameter. Remove or comment out the variable name to silence this warning.
  --> src/Events.sol:11:18:
   |
11 |     function get(address _user) external view returns (uint256) {
   |                  ^^^^^^^^^^^^^
`;

function parseWarnings(output) {
  const warnings = [];
  const lines = output.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match Solidity warning format: "Warning (5667): Unused function parameter..."
    const warningMatch = line.match(/Warning\s*\((\d+)\):\s*(.+)/);
    if (warningMatch) {
      const warning = {
        type: 'compilation_warning',
        code: warningMatch[1],
        message: warningMatch[2].trim(),
        line: i + 1,
        severity: 'warning'
      };
      
      // Look ahead for file location in next lines
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nextLine = lines[j];
        if (nextLine.includes('-->') && nextLine.includes('.sol:')) {
          const locationMatch = nextLine.match(/-->\s*(.+\.sol):(\d+):(\d+)/);
          if (locationMatch) {
            warning.file = locationMatch[1];
            warning.line = parseInt(locationMatch[2]);
            warning.column = parseInt(locationMatch[3]);
            break;
          }
        }
      }
      
      warnings.push(warning);
      continue;
    }
    
    // Match simple warning format: "Warning: ..."
    if (line.includes('Warning:') || line.includes('warning:')) {
      warnings.push({
        type: 'compilation_warning',
        message: line.replace(/Warning:\s*/i, '').trim(),
        line: i + 1,
        severity: 'warning'
      });
      continue;
    }
  }
  
  return warnings;
}

console.log('Test output:');
console.log(testOutput);
console.log('\nParsed warnings:');
console.log(JSON.stringify(parseWarnings(testOutput), null, 2));
