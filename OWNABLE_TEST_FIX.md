# Ownable Test Fix

## Problem

OpenZeppelin's Ownable contract uses **custom errors** (not string errors) in newer versions.

The test was using:
```solidity
vm.expectRevert("Ownable: caller is not the owner");
```

But OpenZeppelin v5+ uses the custom error:
```solidity
error OwnableUnauthorizedAccount(address account);
```

## Solutions

### Option 1: Use Custom Error with abi.encodeWithSelector (Recommended)

```solidity
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// Get the error selector
bytes4 selector = Ownable.OwnableUnauthorizedAccount.selector;
vm.expectRevert(abi.encodeWithSelector(selector, user));
```

### Option 2: Use the Error Type Directly

```solidity
vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
```

### Option 3: Import and Use the Error

```solidity
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

vm.expectRevert(
    abi.encodeWithSelector(
        bytes4(keccak256("OwnableUnauthorizedAccount(address)")),
        user
    )
);
```

### Option 4: Check OpenZeppelin Version

If using OpenZeppelin v4 or earlier, string errors work:
```solidity
vm.expectRevert("Ownable: caller is not the owner");
```

For v5+, use custom error format.

