#!/bin/bash

# Test to verify the correct revert error format for Ownable
echo "🧪 Testing Ownable Revert Format"
echo ""
echo "The issue: OpenZeppelin v5+ uses custom errors, not string errors"
echo ""
echo "❌ Old (doesn't work):"
echo '   vm.expectRevert("Ownable: caller is not the owner");'
echo ""
echo "✅ New (correct for v5+):"
echo '   vm.expectRevert('
echo '       abi.encodeWithSelector('
echo '           bytes4(keccak256("OwnableUnauthorizedAccount(address)")),'
echo '           user'
echo '       )'
echo '   );'
echo ""
echo "📋 The fixed test code is in: OwnableExampleTestFixed.sol"
