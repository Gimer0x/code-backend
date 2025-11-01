// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";        

contract SetOwner is Ownable {

    uint256 public constant rewardRate = 1e18;
    uint256 public value;

    mapping(address => uint256) public userAmount;

    constructor() payable Ownable(msg.sender){
    }

    function setValue() external {
        value = 0;
    }
}