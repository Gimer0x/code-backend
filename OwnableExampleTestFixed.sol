// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/access/Ownable.sol"; // Import Ownable to access the error
import "../src/OwnableExample.sol";

contract OwnableExampleTest is Test {
    OwnableExample example;

    address owner = address(this);
    address user = address(0xBEEF);

    function setUp() public {
        example = new OwnableExample();
    }

    function testOwnerCanSetValue() public {
        example.setValue(123);
        assertEq(example.getValue(), 123, "Owner should be able to set value");
    }

    function testNonOwnerCannotSetValue() public {
        vm.prank(user); // simulate call from a non-owner address
        
        // Use custom error selector for OpenZeppelin v5+
        // Format: bytes4(keccak256("OwnableUnauthorizedAccount(address)"))
        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("OwnableUnauthorizedAccount(address)")),
                user
            )
        );
        example.setValue(999);
    }

    function testOwnershipTransfer() public {
        example.transferOwnership(user);
        assertEq(example.owner(), user);

        // Old owner should now fail
        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("OwnableUnauthorizedAccount(address)")),
                address(this)
            )
        );
        example.setValue(111);

        // New owner should succeed
        vm.prank(user);
        example.setValue(222);
        assertEq(example.getValue(), 222);
    }
}

