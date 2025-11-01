// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/SetValue.sol";

contract SetValueTest is Test {
    SetValue public setValue;
    address public owner = address(this);
    address public user1 = address(0xABCD);
    address public user2 = address(0xBEEF);

    string public constant CONTRACT_NAME = "Test Contract";
    uint256 public constant INITIAL_NUMBER = 42;

    function setUp() public {
        // Deploy the contract before each test
        setValue = new SetValue(CONTRACT_NAME, INITIAL_NUMBER);
    }

    function testInitialSetup() public {
        assertEq(setValue.name(), CONTRACT_NAME, "Name should match");
        assertEq(setValue.number(), INITIAL_NUMBER, "Initial number should match");
        assertTrue(setValue.isActive(), "isActive should be true");
        assertEq(setValue.owner(), owner, "Owner should be the deployer");
    }

    function testRewardRateConstant() public {
        assertEq(setValue.REWARD_RATE(), 1e18, "REWARD_RATE constant mismatch");
    }

    function testCreationTimeIsSet() public {
        uint256 deployTime = setValue.creationTime();
        assertApproxEqAbs(deployTime, block.timestamp, 1, "creationTime mismatch");
    }

    function testDoubleNumber() public {
        uint256 expected = INITIAL_NUMBER * 2;
        assertEq(setValue.doubleNumber(), expected, "doubleNumber() should double the value");
    }

    function testSetNumber() public {
        setValue.setNumber(1234);
        assertEq(setValue.number(), 1234, "setNumber should update number");
    }

    function testDepositIncreasesBalance() public {
        vm.startPrank(user1);
        setValue.deposit(100);
        setValue.deposit(50);
        vm.stopPrank();

        uint256 balance = setValue.userBalances(user1);
        assertEq(balance, 150, "Deposit should accumulate correctly");
    }

    function testMultipleUsersHaveSeparateBalances() public {
        vm.prank(user1);
        setValue.deposit(200);

        vm.prank(user2);
        setValue.deposit(500);

        assertEq(setValue.userBalances(user1), 200, "User1 balance mismatch");
        assertEq(setValue.userBalances(user2), 500, "User2 balance mismatch");
    }

    function testDoubleNumberDoesNotModifyState() public {
        uint256 before = setValue.number();
        setValue.doubleNumber();
        uint256 afterValue = setValue.number();

        assertEq(before, afterValue, "doubleNumber should not modify state");
    }
}
