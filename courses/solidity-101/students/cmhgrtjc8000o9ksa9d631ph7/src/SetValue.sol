// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SetValue {
    uint256 public number;           // Unsigned integer (0, 1, 2, ...)
    int256 public signedNumber;      // Signed integer (-1, 0, 1, ...)
    string public name;              // String data type
    bool public isActive;            // Boolean (true/false)
    address public owner;            // Ethereum address

    uint256 public constant REWARD_RATE = 1e18;
    uint256 public immutable creationTime;
    mapping(address => uint256) public userBalances;

    constructor(string memory _name, uint256 _initialNumber) {
        owner = msg.sender;          // msg.sender is the deployer
        name = _name;
        number = _initialNumber;
        isActive = true;
        creationTime = block.timestamp;
    }
}
